import { Injectable } from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

type Argon2Api = {
  hash: (password: string) => Promise<string>;
  verify: (hash: string, password: string) => Promise<boolean>;
};

let argon2: Argon2Api | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loaded = require('@node-rs/argon2') as {
    hash: (password: string, options?: unknown) => Promise<string>;
    verify: (hash: string, password: string) => Promise<boolean>;
  };
  argon2 = {
    hash: (password) => loaded.hash(password),
    verify: (hash, password) => loaded.verify(hash, password),
  };
} catch {
  argon2 = null;
}

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    if (argon2) return argon2.hash(password);
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    if (passwordHash.startsWith('scrypt$')) {
      const [, salt, digest] = passwordHash.split('$');
      if (!salt || !digest) return false;
      const derived = scryptSync(password, salt, 64);
      const expected = Buffer.from(digest, 'hex');
      return derived.length === expected.length && timingSafeEqual(derived, expected);
    }
    if (!argon2) return false;
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
