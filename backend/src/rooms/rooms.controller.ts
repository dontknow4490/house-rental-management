import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  Ip,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('rooms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class RoomsController {
  constructor(private roomsService: RoomsService) {}

  @Get()
  async getAllRooms() {
    return this.roomsService.getAllRooms();
  }

  @Get(':id')
  async getRoomById(@Param('id') id: string) {
    return this.roomsService.getRoomById(id);
  }

  @Put(':id/rent')
  async updateRoomRent(
    @Param('id') id: string,
    @Body('defaultRent') defaultRent: number,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    return this.roomsService.updateRoomRent(id, Number(defaultRent), adminId, ipAddress);
  }
}
