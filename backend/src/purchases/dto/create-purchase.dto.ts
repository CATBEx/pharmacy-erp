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

  // Total paid for the whole batch (bug #9), not per-unit -- the service divides by qty and
  // stores the per-unit cost, same as before. String so we don't lose precision to floating
  // point; validated as a numeric string.
  @IsNumberString()
  purchaseAmount!: string;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string;
}
