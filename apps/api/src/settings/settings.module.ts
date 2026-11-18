import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { AppSettings } from '@vams/shared';
import { DatabaseService } from '../db/database.service';
import { nowIso } from '../common/time';

export const DEFAULT_SETTINGS: AppSettings = {
  maxPerSlot: null,
  allowStaffMaterialize: false,
  venue: 'Office of the Secretary, Transport, Roads & Buildings Department',
  instructions: '',
};

const SETTING_KEYS: Array<keyof AppSettings> = [
  'maxPerSlot',
  'allowStaffMaterialize',
  'venue',
  'instructions',
];

@Injectable()
export class SettingsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  get(): AppSettings {
    const rows = this.db.all<{ key: string; value: string }>('SELECT key, value FROM app_settings');
    const values = new Map(rows.map((row) => [row.key, row.value]));
    const read = <T>(key: keyof AppSettings, fallback: T): T => {
      const raw = values.get(key);
      if (raw === undefined) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    };
    return {
      maxPerSlot: read('maxPerSlot', DEFAULT_SETTINGS.maxPerSlot),
      allowStaffMaterialize: read('allowStaffMaterialize', DEFAULT_SETTINGS.allowStaffMaterialize),
      venue: read('venue', DEFAULT_SETTINGS.venue),
      instructions: read('instructions', DEFAULT_SETTINGS.instructions),
    };
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const timestamp = nowIso();
    const next = { ...this.get(), ...patch };
    for (const key of SETTING_KEYS) {
      this.db.run(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        key,
        JSON.stringify(next[key]),
        timestamp,
      );
    }
    return next;
  }
}

@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
