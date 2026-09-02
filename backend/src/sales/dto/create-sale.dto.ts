import { ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SaleItemDto } from './sale-item.dto.js';

// One checkout = one invoice with one or more line items -- exactly what the cart on
// the POS screen builds up before "Complete Sale".
export class CreateSaleDto {
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];
}
