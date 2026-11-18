import type { AuthUser, Permission, Role, UserRecord } from '@vams/shared';

export interface UserRow {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: Role;
  password_hash: string;
  active: number;
  must_change_password: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export function toAuthUser(row: UserRow, permissions: Permission[]): AuthUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    email: row.email,
    mustChangePassword: Boolean(row.must_change_password),
    permissions,
  };
}

export function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    email: row.email,
    active: Boolean(row.active),
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}
