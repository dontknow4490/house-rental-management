import { IsNotEmpty, IsNumber, IsOptional, IsString, Min, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomPurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  itemName: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateBatchCustomPurchasesDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustomPurchaseItemDto)
  items: CustomPurchaseItemDto[];

  @IsNumber()
  yearBS: number;

  @IsNumber()
  monthBS: number;

  @IsOptional()
  @IsString()
  purchaseDateBS?: string;
}

export class CreateCustomPurchaseDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  @IsNotEmpty()
  itemName: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  yearBS: number;

  @IsNumber()
  monthBS: number;

  @IsOptional()
  @IsString()
  purchaseDateBS?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCustomPurchaseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  itemName?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  yearBS?: number;

  @IsOptional()
  @IsNumber()
  monthBS?: number;

  @IsOptional()
  @IsString()
  purchaseDateBS?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
