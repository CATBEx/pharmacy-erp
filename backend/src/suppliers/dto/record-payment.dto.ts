import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class RecordPaymentDto {
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
