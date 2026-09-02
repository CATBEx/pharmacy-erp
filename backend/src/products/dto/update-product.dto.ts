import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  unit?: string;

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

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
