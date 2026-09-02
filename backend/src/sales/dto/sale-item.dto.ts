import { IsInt, IsNumberString, IsPositive } from 'class-validator';

export class SaleItemDto {
  @IsInt()
  productId!: number;

  @IsInt()
  @IsPositive()
  qty!: number;

  @IsNumberString()
  salePrice!: string;
}
