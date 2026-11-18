import { Pool } from 'pg';

export interface PgPoolOptions {
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export function createPgPool(connectionString: string, options: PgPoolOptions = {}): Pool {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');
  const isSupabase = url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.com');
  const ssl =
    sslmode === 'disable'
      ? false
      : sslmode || isSupabase
        ? { rejectUnauthorized: false }
        : undefined;
  return new Pool({
    connectionString: url.toString(),
    ssl,
    max: options.max ?? 5,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 15_000,
  });
}
