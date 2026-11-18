import 'reflect-metadata';
import { loadConfig } from './config';
import { EmailAdapter } from './notifications/email.adapter';
import { WhatsappAdapter } from './notifications/whatsapp.adapter';

async function main(): Promise<void> {
  const [channel, recipient] = process.argv.slice(2);
  if ((channel !== 'email' && channel !== 'whatsapp') || !recipient) {
    console.error('Usage: npm run notify:test -w @vams/api -- <email|whatsapp> <recipient>');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const message = {
    to: recipient,
    subject: 'VAMS test notification',
    body: `VAMS test message sent at ${new Date().toISOString()}. If you received this, outbound ${channel} is configured.`,
    reference: 'TEST-NOTIFICATION',
  };

  const adapter = channel === 'email' ? new EmailAdapter(config) : new WhatsappAdapter(config);
  if (adapter.simulated) {
    console.warn(
      `${channel} is still simulated: configure ${channel === 'email' ? 'SMTP_HOST/SMTP_USER/SMTP_PASSWORD' : 'TWILIO_* or WHATSAPP_*'} in .env`,
    );
  }
  const result = await adapter.send(message);
  console.log(
    `${channel} -> ${recipient}: ${result.simulated ? 'simulated' : 'accepted by provider'} (${result.providerMessageId})`,
  );
}

void main();
