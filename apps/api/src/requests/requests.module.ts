import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { VisitorsModule } from '../visitors/visitors.module';
import { RegisterController, RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [VisitorsModule, NotificationsModule],
  controllers: [RequestsController, RegisterController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
