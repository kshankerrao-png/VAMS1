import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './config.module';
import { DatabaseModule } from './db/database.module';
import { SettingsModule } from './settings/settings.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { VisitorsModule } from './visitors/visitors.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RequestsModule } from './requests/requests.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    SettingsModule,
    AuditModule,
    AuthModule,
    VisitorsModule,
    NotificationsModule,
    RequestsModule,
    ReportsModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
