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
  const now = new Date();
  const message = {
    to: recipient,
    subject: 'VAMS test notification',
    body: `VAMS test message sent at ${now.toISOString()}. If you received this, outbound ${channel} is configured.`,
    reference: 'TEST-NOTIFICATION',
    templateVariables:
      channel === 'whatsapp'
        ? {
            '1': now.toLocaleDateString('en-IN'),
            '2': now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          }
        : undefined,
    namedTemplateVariables:
      channel === 'whatsapp'
        ? {
            visitor_name: 'Test Visitor',
            reference: 'TEST-NOTIFICATION',
            assigned_date: now.toLocaleDateString('en-IN'),
            assigned_time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            venue: 'Test Venue',
            instructions: 'This is a test message.',
          }
        : undefined,
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
