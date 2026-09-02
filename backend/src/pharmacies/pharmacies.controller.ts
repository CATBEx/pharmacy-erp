import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { PharmaciesService } from './pharmacies.service.js';
import { CreatePharmacyDto } from './dto/create-pharmacy.dto.js';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';

// Every route here is super_admin only -- this is the platform-owner control panel,
// not something any pharmacy's own staff should ever reach.
@Roles('super_admin')
@Controller('pharmacies')
export class PharmaciesController {
  constructor(private readonly pharmaciesService: PharmaciesService) {}

  @Get()
  list() {
    return this.pharmaciesService.list();
  }

  @Post()
  create(@Body() dto: CreatePharmacyDto) {
    return this.pharmaciesService.create(dto);
  }

  @Get(':id')
  getDetails(@Param('id', ParseIntPipe) id: number) {
    return this.pharmaciesService.getDetails(id);
  }

  @Patch(':id/subscription')
  updateSubscription(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubscriptionDto) {
    return this.pharmaciesService.updateSubscription(id, dto);
  }

  @Post(':id/regenerate-password')
  regeneratePassword(@Param('id', ParseIntPipe) id: number) {
    return this.pharmaciesService.regeneratePassword(id);
  }
}
