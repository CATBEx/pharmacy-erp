import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DbModule } from './db/db.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PharmaciesModule } from './pharmacies/pharmacies.module.js';
import { UsersModule } from './users/users.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { ProductsModule } from './products/products.module.js';
import { MedicineMasterModule } from './medicine-master/medicine-master.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { SalesModule } from './sales/sales.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    PharmaciesModule,
    UsersModule,
    SuppliersModule,
    ProductsModule,
    MedicineMasterModule,
    PurchasesModule,
    SalesModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Applied globally: every route requires a valid JWT unless marked @Public(),
    // and every route enforces its @Roles(...) requirement.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
