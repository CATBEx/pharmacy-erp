import { IsInt, IsISO8601, IsNumberString, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreatePurchaseDto {
  @IsInt()
  productId!: number;

  @IsOptional()
  @IsInt()
  supplierId?: number;

  @IsInt()
  @IsPositive()
  qty!: number;

  // string so we don't lose precision to floating point; validated as a numeric string
  @IsNumberString()
  purchasePrice!: string;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string;
}
