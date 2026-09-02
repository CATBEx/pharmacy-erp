import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @IsOptional()
  @IsInt()
  medicineMasterId?: number; // link to the shared catalog, or omit for a fully custom item

  @IsString()
  name!: string; // denormalized display name (auto-filled from master catalog on the frontend, but always stored)

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderLevel?: number;
}
