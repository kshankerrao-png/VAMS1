import { Controller, Get, Inject } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from './config';
import { Public } from './common/decorators';
import { DatabaseService } from './db/database.service';
import { nowIso } from './common/time';

@Controller()
export class AppController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  @Public()
  @Get('health')
  health() {
    const healthy = this.db.isHealthy();
    return {
      status: healthy ? 'ok' : 'degraded',
      time: nowIso(),
      version: this.config.appVersion,
      services: {
        database: healthy ? 'ok' : 'error',
        email: this.config.emailConfigured ? 'configured' : 'simulated',
        whatsapp: this.config.whatsappConfigured ? 'configured' : 'simulated',
      },
    };
  }
}
