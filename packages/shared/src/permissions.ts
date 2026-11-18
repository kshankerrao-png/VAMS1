import { Permission, ROLE_PERMISSIONS, Role } from './constants';

export interface PermissionSubject {
  role: Role;
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasPermission(
  subject: PermissionSubject,
  permission: Permission,
  options?: { allowStaffMaterialize?: boolean },
): boolean {
  if (roleHasPermission(subject.role, permission)) return true;
  if (
    permission === 'request:materialize' &&
    subject.role === 'PESHI_STAFF' &&
    options?.allowStaffMaterialize === true
  ) {
    return true;
  }
  return false;
}

export function permissionsForRole(
  role: Role,
  options?: { allowStaffMaterialize?: boolean },
): Permission[] {
  const permissions = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
  if (options?.allowStaffMaterialize && role === 'PESHI_STAFF') {
    permissions.add('request:materialize');
  }
  return [...permissions];
}
