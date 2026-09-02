import { IsIn, IsISO8601, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateSubscriptionDto {
  @IsIn(['trial', 'active', 'inactive'])
  status!: 'trial' | 'active' | 'inactive';

  // Preferred path when activating: "keep this pharmacy active for N days", after
  // which PharmaciesService's cron job auto-deactivates it. Server computes the
  // actual expiry timestamp from this -- see PharmaciesService.updateSubscription.
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;

  // Escape hatch for setting an exact expiry date directly instead of "N days from
  // now". Ignored if `days` is also given.
  @IsOptional()
  @IsISO8601()
  expiry?: string;
}
