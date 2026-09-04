import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateRoomDto {
  @IsNumber()
  @Min(1)
  roomNumber: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsNumber()
  @Min(0)
  defaultRent: number;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultRent?: number;
}
