import { IsInt, IsNumberString, IsPositive } from 'class-validator';

export class SaleItemDto {
  @IsInt()
  productId!: number;

  @IsInt()
  @IsPositive()
  qty!: number;

  // Total charged for this line item (bug #12), not per-unit -- the checkout service divides by
  // qty and stores the per-unit sale price, same as before.
  @IsNumberString()
  saleAmount!: string;
}
