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

  // Packaging hierarchy for this pharmacy's own stock -- see schema.ts on `products`. Both
  // default to 1 (sold loose) when omitted.
  @IsOptional()
  @IsInt()
  @Min(1)
  piecesPerStrip?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  stripsPerBox?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderLevel?: number;
}
