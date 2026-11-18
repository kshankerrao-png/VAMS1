import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('NotificationWorker');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    if (!this.config.workerEnabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.workerIntervalMs);
    this.timer.unref();
    const initial = setTimeout(() => void this.tick(), 1200);
    initial.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  kick(): void {
    if (!this.config.workerEnabled) return;
    setImmediate(() => void this.tick());
  }

  async drainAll(maxBatches = 20): Promise<void> {
    for (let index = 0; index < maxBatches; index += 1) {
      const processed = await this.notifications.processDue(20);
      if (processed === 0) break;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.drainAll(4);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.running = false;
    }
  }
}
