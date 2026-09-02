import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

// Pharmacy admin uses this to add a salesman or manager to their own pharmacy.
// super_admin and pharmacy_admin can never be created through this endpoint.
export class CreateStaffDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(['salesman', 'manager'])
  role!: 'salesman' | 'manager';
}
