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

  permissionsFor(user: { role: Role }): Permission[] {
    return permissionsForRole(user.role, {
      allowStaffMaterialize: this.settings.get().allowStaffMaterialize,
    });
  }

  hasPermission(user: { role: Role }, permission: Permission): boolean {
    return sharedHasPermission(user, permission, {
      allowStaffMaterialize: this.settings.get().allowStaffMaterialize,
    });
  }
}
