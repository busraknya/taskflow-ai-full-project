import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Email delivery is off unless SMTP_HOST is configured. The product never
 * falls back to a third-party mail server: on a self-hosted installation no
 * data may leave the server without the operator's explicit configuration.
 */
export function isEmailDeliveryEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

/** SMTP transport from the environment, or null when email is disabled. */
export function createMailTransport(): nodemailer.Transporter | null {
  if (!isEmailDeliveryEnabled()) return null;
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER?.trim();
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    // 465 is implicit TLS; other ports upgrade with STARTTLS when offered.
    secure: port === 465,
    ...(user ? { auth: { user, pass: process.env.SMTP_PASSWORD || '' } } : {}),
  });
}

const logger = new Logger('EmailDelivery');
let disabledWarningLogged = false;

/** Logs once per process that email is disabled. */
export function warnEmailDisabledOnce(): void {
  if (disabledWarningLogged) return;
  disabledWarningLogged = true;
  logger.warn(
    'Email delivery is disabled because SMTP_HOST is not set. Invitation links must be shared manually; see "Email delivery" in README.md.',
  );
}

/** For tests only. */
export function resetEmailWarningForTests(): void {
  disabledWarningLogged = false;
}
