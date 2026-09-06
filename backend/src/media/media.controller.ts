import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  Ip,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  async getMediaAudit() {
    return this.mediaService.getMediaAudit();
  }

  @Delete()
  async deleteMediaItem(
    @Query('publicId') publicId: string,
    @Query('force') force: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    const isForce = force === 'true' || force === '1';
    return this.mediaService.deleteMediaItem(publicId, isForce, adminId, ipAddress);
  }

  @Delete(':publicId(*)')
  async deleteMediaItemByParam(
    @Param('publicId') publicId: string,
    @Query('force') force: string,
    @CurrentUser('id') adminId: string,
    @Ip() ipAddress: string,
  ) {
    const isForce = force === 'true' || force === '1';
    return this.mediaService.deleteMediaItem(publicId, isForce, adminId, ipAddress);
  }
}
