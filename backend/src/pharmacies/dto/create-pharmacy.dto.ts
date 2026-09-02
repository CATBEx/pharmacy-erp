import { IsEmail, IsString } from 'class-validator';

// Super admin uses this to onboard a new subscribing pharmacy: it creates the
// pharmacy tenant AND its first pharmacy_admin user in one step. The admin's login
// name reuses the business name (no separate "owner name" field), and the admin's
// password is generated server-side, never typed in here -- see pharmacies.service.ts.
export class CreatePharmacyDto {
  @IsString()
  pharmacyName!: string;

  @IsString()
  address!: string;

  @IsString()
  phone!: string;

  @IsEmail()
  adminEmail!: string;
}
