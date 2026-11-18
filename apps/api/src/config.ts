import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';

export const APP_CONFIG = 'APP_CONFIG';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export interface WhatsappConfig {
  apiUrl: string;
  phoneNumberId: string;
  token: string;
  verifyToken: string;
  appSecret: string;
  templateName: string;
  templateLang: string;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

export interface AppConfig {
  repoRoot: string;
  port: number;
  nodeEnv: string;
  isProd: boolean;
  dbPath: string;
  storageDir: string;
  webDist: string;
  cookieName: string;
  cookieSecure: boolean;
  sessionIdleMinutes: number;
  sessionAbsoluteHours: number;
  workerEnabled: boolean;
  workerIntervalMs: number;
  allowSimulation: boolean;
  emailConfigured: boolean;
  whatsappConfigured: boolean;
  whatsappCountryCode: string;
  smtp: SmtpConfig;
  whatsapp: WhatsappConfig;
  twilio: TwilioConfig;
  appBaseUrl: string;
  appVersion: string;
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (let depth = 0; depth < 10; depth += 1) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (Array.isArray(pkg.workspaces)) return dir;
      } catch {
        // ignore malformed package files while walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function numberFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): AppConfig {
  const repoRoot = findRepoRoot(__dirname);
  dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });
  dotenv.config({ path: path.join(repoRoot, 'apps', 'api', '.env'), quiet: true });

  const env = process.env;
  const serverless = Boolean(env.VERCEL);
  const nodeEnv = env.NODE_ENV ?? (serverless ? 'production' : 'development');
  const isProd = nodeEnv === 'production';
  const dbPath = env.DB_PATH
    ? path.resolve(repoRoot, env.DB_PATH)
    : serverless
      ? path.join(os.tmpdir(), 'vams.db')
      : path.join(repoRoot, 'storage', 'vams.db');
  const storageDir = env.STORAGE_DIR
    ? path.resolve(repoRoot, env.STORAGE_DIR)
    : serverless
      ? path.join(os.tmpdir(), 'vams-outbox')
      : path.dirname(dbPath);

  const smtp: SmtpConfig = {
    host: env.SMTP_HOST ?? '',
    port: numberFrom(env.SMTP_PORT, 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER ?? '',
    password: env.SMTP_PASSWORD ?? '',
    from: env.SMTP_FROM ?? 'VAMS, T,R&B Department <no-reply@example.gov.in>',
  };

  const whatsapp: WhatsappConfig = {
    apiUrl: env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v21.0',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    token: env.WHATSAPP_TOKEN ?? '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? '',
    appSecret: env.WHATSAPP_APP_SECRET ?? '',
    templateName: env.WHATSAPP_TEMPLATE_NAME ?? '',
    templateLang: env.WHATSAPP_TEMPLATE_LANG ?? 'en',
  };

  const twilio: TwilioConfig = {
    accountSid: env.TWILIO_ACCOUNT_SID ?? '',
    authToken: env.TWILIO_AUTH_TOKEN ?? '',
    from: env.TWILIO_WHATSAPP_FROM ?? '',
  };
  const twilioConfigured = Boolean(twilio.accountSid && twilio.authToken && twilio.from);
  const whatsappCloudConfigured = Boolean(whatsapp.phoneNumberId && whatsapp.token);

  const allowSimulation = env.ALLOW_NOTIFICATION_SIMULATION
    ? env.ALLOW_NOTIFICATION_SIMULATION === 'true'
    : !isProd;

  return {
    repoRoot,
    port: numberFrom(env.PORT, 4000),
    nodeEnv,
    isProd,
    dbPath,
    storageDir,
    webDist: path.join(repoRoot, 'apps', 'web', 'dist'),
    cookieName: 'vams_session',
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : serverless,
    sessionIdleMinutes: numberFrom(env.SESSION_IDLE_MINUTES, 30),
    sessionAbsoluteHours: numberFrom(env.SESSION_ABSOLUTE_HOURS, 8),
    workerEnabled: env.WORKER_ENABLED ? env.WORKER_ENABLED !== 'false' : !serverless,
    workerIntervalMs: numberFrom(env.WORKER_INTERVAL_MS, 3000),
    allowSimulation,
    emailConfigured: Boolean(smtp.host),
    whatsappConfigured: twilioConfigured || whatsappCloudConfigured,
    whatsappCountryCode: (env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? '91').replace(/\D/g, '') || '91',
    smtp,
    whatsapp,
    twilio,
    appBaseUrl: env.APP_BASE_URL ?? `http://localhost:${numberFrom(env.PORT, 4000)}`,
    appVersion: '1.0.0',
  };
}
