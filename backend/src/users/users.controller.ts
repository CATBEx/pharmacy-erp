import { Body, Controller, Get, Post } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/jwt-payload.js';

@Roles('pharmacy_admin')
@Controller('users/staff')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    // pharmacyId always comes from the verified JWT, never from a query param --
    // that's what stops one pharmacy from listing another's staff.
    return this.usersService.listStaff(user.pharmacyId!);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.usersService.createStaff(user.pharmacyId!, dto);
  }
}
