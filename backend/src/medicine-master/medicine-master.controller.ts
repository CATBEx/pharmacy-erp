import { Controller, Get, Query } from '@nestjs/common';
import { MedicineMasterService } from './medicine-master.service.js';
import { Roles } from '../common/decorators/roles.decorator.js';

// Read-only for any authenticated pharmacy staff -- it's a shared reference catalog,
// not tenant data, so no pharmacyId scoping is needed here.
@Roles('pharmacy_admin', 'manager', 'salesman')
@Controller('medicine-master')
export class MedicineMasterController {
  constructor(private readonly service: MedicineMasterService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.service.search(q);
  }
}
