import { Module } from '@nestjs/common';
import { MedicineMasterService } from './medicine-master.service.js';
import { MedicineMasterController } from './medicine-master.controller.js';

@Module({
  controllers: [MedicineMasterController],
  providers: [MedicineMasterService],
})
export class MedicineMasterModule {}
