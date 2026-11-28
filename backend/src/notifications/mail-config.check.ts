import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { describeError } from '../common/logging/log-sanitizer';
import { createMailTransport, warnEmailDisabledOnce } from './mail-transport';

/**
 * Reports the email configuration at startup: disabled, reachable, or
 * configured but failing (wrong host, port or credentials). Never blocks
 * startup.
 */
@Injectable()
export class MailConfigCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(MailConfigCheck.name);

  onApplicationBootstrap(): void {
    const transport = createMailTransport();
    if (!transport) {
      warnEmailDisabledOnce();
      return;
    }
    transport
      .verify()
      .then(() => this.logger.log('SMTP connection verified.'))
      .catch((error: unknown) =>
        this.logger.error(
          `SMTP is configured but the connection check failed: ${describeError(error).summary}`,
        ),
      );
  }
}
