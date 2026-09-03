import { IsBoolean } from 'class-validator';

// Bug #15: deactivate/reactivate a staff account. Deliberately single-purpose (just
// `active`) -- there's no staff "edit" UI beyond this yet, and AuthService.login()
// already refuses any user row with active=false, so this is the whole mechanism.
export class UpdateStaffDto {
  @IsBoolean()
  active!: boolean;
}
