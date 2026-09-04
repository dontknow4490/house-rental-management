import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NepaliCalendarService, NEPALI_MONTH_NAMES } from '../nepali-calendar/nepali-calendar.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PaymentMethod } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';

export interface SubmitPaymentDto {
  billId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionId?: string;
  proofImagePath?: string;
  paymentDateBS?: string;
}

export interface VerifyPaymentDto {
  verified: boolean;
  rejectionReason?: string;
}

export interface RecordCashPaymentDto {
  tenantId: string;
  billId?: string;
  amount: number;
  paymentDateBS?: string;
  notes?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private nepaliCalendarService: NepaliCalendarService,
    private auditLogService: AuditLogService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Tenant submits payment proof
   */
  async submitPayment(
    dto: SubmitPaymentDto,
    tenantId: string,
    proofImagePath?: string,
    ipAddress?: string,
  ) {
    const bill = await this.prisma.monthlyBill.findUnique({
      where: { id: dto.billId },
      include: {
        room: true,
        tenant: true,
      },
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    if (bill.tenantId !== tenantId) {
      throw new ForbiddenException('You cannot submit payment for another tenant’s bill');
    }

    const payAmount = Number(dto.amount);
    if (payAmount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const finalProofPath = proofImagePath || dto.proofImagePath;
    if (!finalProofPath || !finalProofPath.trim()) {
      throw new BadRequestException('Payment proof screenshot is required');
    }

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const paymentDateBS = dto.paymentDateBS || todayBS.nepaliFormatted;

    const payment = await this.prisma.payment.create({
      data: {
        billId: bill.id,
        tenantId,
        amount: payAmount,
        paymentMethod: dto.paymentMethod || 'ESEWA',
        transactionId: dto.transactionId?.trim() || null,
        proofImagePath: finalProofPath,
        paymentDateBS,
        paymentDateAD: new Date(),
        status: 'PENDING_VERIFICATION',
      },
    });

    // Update bill(s) status to PENDING_VERIFICATION
    await this.prisma.monthlyBill.updateMany({
      where: {
        tenantId,
        status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
      },
      data: { status: 'PENDING_VERIFICATION' },
    });

    await this.auditLogService.log({
      userId: tenantId,
      username: bill.tenant.username,
      action: 'PAYMENT_SUBMITTED',
      details: {
        paymentId: payment.id,
        billId: bill.id,
        amount: payAmount,
        method: dto.paymentMethod,
        transactionId: dto.transactionId,
      },
      ipAddress,
    });

    // Notify all active Admins immediately
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });
    const periodLabel = bill.billingPeriodBS || `${bill.yearBS} ${bill.monthNameBS}`;
    for (const admin of admins) {
      await this.notificationsService.createNotification({
        userId: admin.id,
        type: 'PAYMENT_SUBMITTED',
        title: 'Payment Received',
        message: `${bill.tenant.fullName} submitted payment of Rs. ${payAmount} for Room ${bill.room.roomNumber} (${periodLabel})`,
        link: '/admin/payments',
        data: {
          paymentId: payment.id,
          tenantId,
          amount: payAmount,
          roomNumber: bill.room.roomNumber,
          billingPeriodBS: periodLabel,
        },
      });
    }

    return {
      message: 'Payment submitted successfully. Awaiting administrator verification.',
      payment,
    };
  }

  /**
   * Admin verifies or rejects payment
   */
  async verifyPayment(
    paymentId: string,
    dto: VerifyPaymentDto,
    adminId: string,
    ipAddress?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        bill: { include: { room: true } },
        tenant: { include: { tenantProfile: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (payment.status === 'VERIFIED') {
      throw new BadRequestException('Payment has already been verified');
    }

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();

    if (dto.verified) {
      // 1. Generate collision-resistant digital receipt number
      const receiptCount = await this.prisma.digitalReceipt.count();
      let receiptNumber = `REC-${todayBS.yearBS}-${String(todayBS.monthBS).padStart(2, '0')}-${String(receiptCount + 1).padStart(4, '0')}`;
      let seq = receiptCount + 1;
      while (true) {
        const existingReceipt = await this.prisma.digitalReceipt.findUnique({
          where: { receiptNumber },
        });
        if (!existingReceipt) break;
        seq++;
        receiptNumber = `REC-${todayBS.yearBS}-${String(todayBS.monthBS).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
      }

      // 2. Update payment record to VERIFIED
      const updatedPayment = await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedByUserId: adminId,
          receiptNumber,
        },
      });

      // 3. Reconcile all bills and advance balance from all VERIFIED payments
      await this.reconcileTenantBillsAndAdvance(payment.tenantId);

      // 4. Create DigitalReceipt
      const billingPeriodBS = `${this.nepaliCalendarService.toNepaliDigits(payment.bill.yearBS)} ${payment.bill.monthNameBS}`;

      const receipt = await this.prisma.digitalReceipt.create({
        data: {
          paymentId: payment.id,
          receiptNumber,
          tenantName: payment.tenant.fullName,
          roomNumber: payment.bill.room.roomNumber,
          billingPeriodBS,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          transactionId: payment.transactionId,
          issuedDateBS: todayBS.nepaliFullFormatted,
          issuedDateAD: new Date(),
        },
      });

      // 5. Mark water purchases as settled rather than deleting them, ensuring permanent historical audit integrity
      const allPaidBills = await this.prisma.monthlyBill.findMany({
        where: {
          tenantId: payment.tenantId,
          balanceDue: 0,
        },
      });

      if (allPaidBills.length > 0) {
        await this.prisma.waterPurchase.updateMany({
          where: {
            OR: allPaidBills.flatMap((pb) => [
              { billId: pb.id },
              { roomId: pb.roomId, yearBS: pb.yearBS, monthBS: pb.monthBS },
            ]),
          },
          data: {
            isSettled: true,
            settledDateBS: todayBS.nepaliFormatted,
            settledDateAD: new Date(),
          },
        });
      }

      await this.auditLogService.log({
        userId: adminId,
        action: 'PAYMENT_VERIFIED',
        details: {
          paymentId,
          receiptNumber,
          amount: payment.amount,
        },
        ipAddress,
      });

      // Notify the tenant about approval & receipt
      await this.notificationsService.createNotification({
        userId: payment.tenantId,
        type: 'PAYMENT_VERIFIED',
        title: 'Payment Approved',
        message: `Your payment of Rs. ${payment.amount} has been verified. Digital Receipt #${receiptNumber} is now available.`,
        link: '/tenant/receipts',
        data: {
          paymentId,
          receiptNumber,
          amount: payment.amount,
        },
      });

      return {
        message: 'Payment verified and digital receipt issued.',
        payment: updatedPayment,
        receipt,
      };
    } else {
      const rejectionReason = dto.rejectionReason?.trim() || 'Payment proof could not be verified';

      // Reject payment
      const updatedPayment = await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'REJECTED',
          rejectionReason,
        },
      });

      // Reconcile all tenant bills and advance balance from all VERIFIED payments
      await this.reconcileTenantBillsAndAdvance(payment.tenantId);

      await this.auditLogService.log({
        userId: adminId,
        action: 'PAYMENT_REJECTED',
        details: {
          paymentId,
          reason: rejectionReason,
        },
        ipAddress,
      });

      // Get bill period if associated with a bill
      const bill = payment.billId
        ? await this.prisma.monthlyBill.findUnique({ where: { id: payment.billId } })
        : null;
      const billingPeriod = bill?.billingPeriodBS || (bill ? `${bill.yearBS} ${NEPALI_MONTH_NAMES[bill.monthBS - 1]}` : 'Monthly Rent & Utilities');

      // Aggregate remaining total outstanding due for the tenant
      const remainingDueAgg = await this.prisma.monthlyBill.aggregate({
        where: {
          tenantId: payment.tenantId,
          status: { in: ['UNPAID', 'PARTIALLY_PAID', 'PENDING_VERIFICATION'] },
        },
        _sum: { balanceDue: true },
      });
      const remainingDue = remainingDueAgg._sum.balanceDue || 0;

      // Notify the tenant about rejection with reason
      await this.notificationsService.createNotification({
        userId: payment.tenantId,
        type: 'PAYMENT_REJECTED',
        title: 'Payment Rejected',
        message: `Your payment of Rs. ${payment.amount} was rejected. Reason: ${rejectionReason}`,
        link: '/tenant/pay',
        data: {
          paymentId,
          rejectionReason,
          amount: payment.amount,
          billingPeriod,
          remainingDue,
          paymentMethod: payment.paymentMethod,
          transactionId: payment.transactionId,
          submittedAt: payment.createdAt,
        },
      });

      return {
        message: 'Payment marked as rejected.',
        payment: updatedPayment,
      };
    }
  }

  /**
   * Reconciles all monthly bills, verified payments, and advance balance for a tenant.
   * - Computes total pool of ALL genuinely VERIFIED payments for the tenant.
   * - Allocates verified payments chronologically across bills (oldest first).
   * - Sets paidAmount, balanceDue, and status correctly.
   * - Rejection or new submissions never corrupt or reset previously verified payments.
   */
  async reconcileTenantBillsAndAdvance(tenantId: string) {
    const allBills = await this.prisma.monthlyBill.findMany({
      where: { tenantId },
      orderBy: [{ yearBS: 'asc' }, { monthBS: 'asc' }],
    });

    const verifiedPayments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        status: 'VERIFIED',
      },
      orderBy: { createdAt: 'asc' },
    });

    const pendingPayments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        status: 'PENDING_VERIFICATION',
      },
    });
    const hasPending = pendingPayments.length > 0;

    let verifiedPool = Number(
      verifiedPayments.reduce((acc, curr) => acc + Number(curr.amount), 0).toFixed(2),
    );

    for (const b of allBills) {
      const total = Number(b.totalAmount.toFixed(2));
      if (verifiedPool >= total) {
        await this.prisma.monthlyBill.update({
          where: { id: b.id },
          data: {
            paidAmount: total,
            balanceDue: 0,
            status: 'PAID',
          },
        });

        verifiedPool = Number((verifiedPool - total).toFixed(2));
      } else if (verifiedPool > 0) {
        const paid = verifiedPool;
        const due = Number(Math.max(0, total - paid).toFixed(2));
        await this.prisma.monthlyBill.update({
          where: { id: b.id },
          data: {
            paidAmount: paid,
            balanceDue: due,
            status: hasPending ? 'PENDING_VERIFICATION' : (due === 0 ? 'PAID' : 'PARTIALLY_PAID'),
          },
        });
        verifiedPool = 0;
      } else {
        await this.prisma.monthlyBill.update({
          where: { id: b.id },
          data: {
            paidAmount: 0,
            balanceDue: total,
            status: hasPending ? 'PENDING_VERIFICATION' : 'UNPAID',
          },
        });
      }
    }

    // Any surplus from verified payments becomes the tenant's advanceBalance
    const tenantProf = await this.prisma.tenantProfile.findUnique({
      where: { userId: tenantId },
    });
    if (tenantProf) {
      await this.prisma.tenantProfile.update({
        where: { id: tenantProf.id },
        data: { advanceBalance: verifiedPool },
      });
    }
  }

  async getPayments(status?: string, tenantId?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;

    return this.prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        bill: {
          include: {
            room: { select: { roomNumber: true, name: true } },
          },
        },
        tenant: {
          select: {
            id: true,
            fullName: true,
            username: true,
            phone: true,
            tenantProfile: {
              include: {
                room: { select: { roomNumber: true, name: true } },
              },
            },
          },
        },
        digitalReceipt: true,
      },
    });
  }

  async getReceiptById(receiptNumber: string) {
    const receipt = await this.prisma.digitalReceipt.findUnique({
      where: { receiptNumber },
      include: {
        payment: {
          include: {
            bill: {
              include: {
                room: true,
              },
            },
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    return receipt;
  }

  /**
   * Admin records direct cash payment from a tenant and clears dues immediately
   */
  async recordCashPayment(
    dto: RecordCashPaymentDto,
    adminId: string,
    ipAddress?: string,
  ) {
    const tenant = await this.prisma.user.findUnique({
      where: { id: dto.tenantId },
      include: {
        tenantProfile: {
          include: { room: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const payAmount = Number(dto.amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      throw new BadRequestException('Cash payment amount must be greater than zero');
    }

    // Determine target bill
    let targetBill = null;
    if (dto.billId) {
      targetBill = await this.prisma.monthlyBill.findUnique({
        where: { id: dto.billId },
        include: { room: true },
      });
      if (!targetBill) {
        throw new NotFoundException('Selected bill not found');
      }
      if (targetBill.tenantId !== dto.tenantId) {
        throw new BadRequestException('Selected bill does not belong to the selected tenant.');
      }
    }

    if (!targetBill) {
      targetBill = await this.prisma.monthlyBill.findFirst({
        where: {
          tenantId: dto.tenantId,
          status: { in: ['UNPAID', 'PARTIALLY_PAID', 'PENDING_VERIFICATION'] },
        },
        orderBy: [{ yearBS: 'asc' }, { monthBS: 'asc' }],
        include: { room: true },
      });
    }

    if (!targetBill) {
      targetBill = await this.prisma.monthlyBill.findFirst({
        where: { tenantId: dto.tenantId },
        orderBy: [{ yearBS: 'desc' }, { monthBS: 'desc' }],
        include: { room: true },
      });
    }

    if (!targetBill) {
      throw new BadRequestException('No monthly bill found for this tenant to attach payment.');
    }

    const todayBS = this.nepaliCalendarService.getCurrentNepaliDate();
    const paymentDateBS = dto.paymentDateBS || todayBS.nepaliFormatted;

    // 1. Generate collision-resistant digital receipt number
    const receiptCount = await this.prisma.digitalReceipt.count();
    let receiptNumber = `REC-${todayBS.yearBS}-${String(todayBS.monthBS).padStart(2, '0')}-${String(receiptCount + 1).padStart(4, '0')}`;
    let seq = receiptCount + 1;
    while (true) {
      const existingReceipt = await this.prisma.digitalReceipt.findUnique({
        where: { receiptNumber },
      });
      if (!existingReceipt) break;
      seq++;
      receiptNumber = `REC-${todayBS.yearBS}-${String(todayBS.monthBS).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
    }
    const transactionId = `CASH-${Date.now()}`;

    // 2. Create verified cash payment record
    const payment = await this.prisma.payment.create({
      data: {
        billId: targetBill?.id || null,
        tenantId: dto.tenantId,
        amount: payAmount,
        paymentMethod: 'CASH',
        transactionId,
        paymentDateBS,
        paymentDateAD: new Date(),
        status: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedByUserId: adminId,
        receiptNumber,
      },
    });

    // 3. Reconcile all bills and advance balance from all VERIFIED payments
    await this.reconcileTenantBillsAndAdvance(dto.tenantId);

    // 4. Create DigitalReceipt
    const roomNumber = tenant.tenantProfile?.room?.roomNumber || targetBill?.room?.roomNumber || 0;
    const billingPeriodBS = targetBill
      ? (targetBill.billingPeriodBS || `${targetBill.yearBS} ${targetBill.monthNameBS}`)
      : `${todayBS.yearBS} ${todayBS.monthNameBS}`;

    const receipt = await this.prisma.digitalReceipt.create({
      data: {
        paymentId: payment.id,
        receiptNumber,
        tenantName: tenant.fullName,
        roomNumber,
        billingPeriodBS,
        amount: payAmount,
        paymentMethod: 'CASH',
        transactionId,
        issuedDateBS: todayBS.nepaliFullFormatted,
        issuedDateAD: new Date(),
      },
    });

    // 5. Mark water purchases as settled rather than deleting them, ensuring permanent historical audit integrity
    const allPaidBills = await this.prisma.monthlyBill.findMany({
      where: {
        tenantId: dto.tenantId,
        balanceDue: 0,
      },
    });

    if (allPaidBills.length > 0) {
      await this.prisma.waterPurchase.updateMany({
        where: {
          OR: allPaidBills.flatMap((pb) => [
            { billId: pb.id },
            { roomId: pb.roomId, yearBS: pb.yearBS, monthBS: pb.monthBS },
          ]),
        },
        data: {
          isSettled: true,
          settledDateBS: todayBS.nepaliFormatted,
          settledDateAD: new Date(),
        },
      });
    }

    await this.auditLogService.log({
      userId: adminId,
      username: tenant.username,
      action: 'PAYMENT_VERIFIED',
      details: {
        paymentId: payment.id,
        receiptNumber,
        amount: payAmount,
        method: 'CASH',
        tenantId: dto.tenantId,
        notes: dto.notes,
      },
      ipAddress,
    });

    // Notify tenant
    await this.notificationsService.createNotification({
      userId: dto.tenantId,
      type: 'PAYMENT_VERIFIED',
      title: 'Cash Payment Received',
      message: `Direct cash payment of Rs. ${payAmount} was received and verified by admin. Digital Receipt #${receiptNumber} is now available.`,
      link: '/tenant/receipts',
      data: {
        paymentId: payment.id,
        receiptNumber,
        amount: payAmount,
        paymentMethod: 'CASH',
      },
    });

    return {
      message: `Cash payment of Rs. ${payAmount} recorded successfully and dues cleared.`,
      payment,
      receipt,
    };
  }
}
