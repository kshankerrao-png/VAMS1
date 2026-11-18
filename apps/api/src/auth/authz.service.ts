import { Inject, Injectable } from '@nestjs/common';
import {
  hasPermission as sharedHasPermission,
  Permission,
  permissionsForRole,
  Role,
} from '@vams/shared';
import { SettingsService } from '../settings/settings.module';

@Injectable()
export class AuthzService {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  async permissionsFor(user: { role: Role }): Promise<Permission[]> {
    const settings = await this.settings.get();
    return permissionsForRole(user.role, {
      allowStaffMaterialize: settings.allowStaffMaterialize,
    });
  }

  async hasPermission(user: { role: Role }, permission: Permission): Promise<boolean> {
    const settings = await this.settings.get();
    return sharedHasPermission(user, permission, {
      allowStaffMaterialize: settings.allowStaffMaterialize,
    });
  }
}
