import { Module } from '@nestjs/common';
import { PharmaciesService } from './pharmacies.service.js';
import { PharmaciesController } from './pharmacies.controller.js';

@Module({
  controllers: [PharmaciesController],
  providers: [PharmaciesService],
})
export class PharmaciesModule {}
