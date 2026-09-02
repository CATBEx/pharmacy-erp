import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export class UpdateSubscriptionDto {
  @IsIn(['trial', 'active', 'inactive'])
  status!: 'trial' | 'active' | 'inactive';

  @IsOptional()
  @IsISO8601()
  expiry?: string;
}
