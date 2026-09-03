import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
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

  // Bug #15: reset a locked-out salesman/manager's password. Scoped to the caller's
  // own pharmacyId, same tenant-isolation pattern as list()/create() above.
  @Post(':id/regenerate-password')
  regeneratePassword(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.regeneratePassword(user.pharmacyId!, id);
  }

  // Bug #15: deactivate/reactivate a staff account (never a hard delete -- see
  // UsersService.setActive for why).
  @Patch(':id')
  updateActive(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStaffDto) {
    return this.usersService.setActive(user.pharmacyId!, id, dto.active);
  }
}
