import { Module, Global } from '@nestjs/common';
import { NepaliCalendarService } from './nepali-calendar.service';
import { NepaliCalendarController } from './nepali-calendar.controller';

@Global()
@Module({
  controllers: [NepaliCalendarController],
  providers: [NepaliCalendarService],
  exports: [NepaliCalendarService],
})
export class NepaliCalendarModule {}
