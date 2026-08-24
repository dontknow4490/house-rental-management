import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { NepaliCalendarService } from './nepali-calendar.service';

@Controller('nepali-calendar')
export class NepaliCalendarController {
  constructor(private readonly nepaliCalendarService: NepaliCalendarService) {}

  @Get('today')
  getToday() {
    return this.nepaliCalendarService.getCurrentNepaliDate();
  }

  @Get('months')
  getMonths() {
    return this.nepaliCalendarService.getNepaliMonths();
  }

  @Get('month-days')
  getMonthDays(
    @Query('yearBS') yearBS: string,
    @Query('monthBS') monthBS: string,
  ) {
    const y = parseInt(yearBS, 10);
    const m = parseInt(monthBS, 10);
    if (isNaN(y) || isNaN(m)) {
      throw new BadRequestException('Valid yearBS and monthBS are required');
    }
    const daysCount = this.nepaliCalendarService.getDaysInMonth(y, m);
    return { yearBS: y, monthBS: m, daysCount };
  }

  @Get('convert/ad-to-bs')
  convertAdToBs(@Query('adDate') adDate: string) {
    if (!adDate) {
      throw new BadRequestException('adDate parameter is required (YYYY-MM-DD)');
    }
    return this.nepaliCalendarService.adToBs(new Date(adDate));
  }

  @Get('convert/bs-to-ad')
  convertBsToAd(
    @Query('yearBS') yearBS: string,
    @Query('monthBS') monthBS: string,
    @Query('dayBS') dayBS: string,
  ) {
    const y = parseInt(yearBS, 10);
    const m = parseInt(monthBS, 10);
    const d = parseInt(dayBS, 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) {
      throw new BadRequestException('Valid yearBS, monthBS, and dayBS are required');
    }
    return { adDate: this.nepaliCalendarService.bsToAd(y, m, d) };
  }
}
