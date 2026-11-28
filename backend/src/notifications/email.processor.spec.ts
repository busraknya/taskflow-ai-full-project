import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

const sendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail })),
}));
// Keep the unit test isolated from Nest packages that ship ESM entry points.
jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {},
}));

import { EmailProcessor } from './email.processor';

type SentMail = { subject: string; text: string; html: string; to: string };

const MALICIOUS = {
  tag: '<img src=x onerror="alert(1)">',
  script: '<script>alert(document.cookie)</script>',
  quotes: `"><a href='https://evil.example.com'>Reset password</a>`,
};

const originalHost = process.env.SMTP_HOST;
beforeAll(() => {
  process.env.SMTP_HOST = 'smtp.example.com';
});
afterAll(() => {
  process.env.SMTP_HOST = originalHost;
});

describe('EmailProcessor HTML escaping', () => {
  const processor = new EmailProcessor();

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  async function render(data: unknown): Promise<SentMail> {
    await processor.process({ data } as Job<never>);
    const [mail] = sendMail.mock.calls[0] as [SentMail];
    return mail;
  }

  /** Removes the markup the template itself is allowed to emit. */
  function stripTemplateMarkup(html: string): string {
    return html
      .replace(/<\/?(p|b)>/g, '')
      .replace(/<a href="[^"<>]*">/g, '')
      .replace(/<\/a>/g, '');
  }

  it('escapes malicious names in the workspace invitation email', async () => {
    const mail = await render({
      recipient: 'member@example.com',
      subject: 'You were invited',
      templateData: {
        type: 'workspace-invitation',
        fullName: MALICIOUS.tag,
        workspaceName: `${MALICIOUS.script}${MALICIOUS.quotes}`,
        expiresAt: '2026-12-02T12:00:00.000Z',
        acceptUrl: 'https://app.example.com/workspaces',
      },
    });

    // No attacker-controlled markup survives; only the template's own tags.
    expect(stripTemplateMarkup(mail.html)).not.toMatch(/[<>]/);
    expect(mail.html).toContain(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    );
    expect(mail.html).toContain('&lt;script&gt;');
    // The injected link is shown as inert text; the only real anchor is the
    // template's own accept link.
    expect(mail.html.match(/<a\s/g)).toHaveLength(1);
    expect(mail.html).toContain(
      '<a href="https://app.example.com/workspaces">',
    );
    expect(mail.html).toContain('&lt;a href=&#39;https://evil.example.com');
  });

  it('keeps legitimate content and leaves the plain-text body unescaped', async () => {
    const mail = await render({
      recipient: 'member@example.com',
      subject: 'You were invited to R&D Team',
      templateData: {
        type: 'workspace-invitation',
        fullName: 'Ada Lovelace',
        workspaceName: 'R&D Team',
        expiresAt: '2026-12-02T12:00:00.000Z',
        acceptUrl: 'https://app.example.com/workspaces',
      },
    });

    expect(mail.html).toContain('<b>Ada Lovelace</b>');
    expect(mail.html).toContain('<b>R&amp;D Team</b>');
    expect(mail.text).toContain('You were invited to join R&D Team');
    expect(mail.text).toContain(
      'Open this link to accept (you can create an account there if you do not have one): https://app.example.com/workspaces',
    );
    expect(mail.subject).toBe('You were invited to R&D Team');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '/relative/path',
  ])('never renders an unsafe accept URL (%p)', async (acceptUrl) => {
    const mail = await render({
      recipient: 'member@example.com',
      subject: 'You were invited',
      templateData: {
        type: 'workspace-invitation',
        fullName: 'Ada',
        workspaceName: 'Team',
        expiresAt: '2026-12-02T12:00:00.000Z',
        acceptUrl,
      },
    });

    expect(mail.html).not.toContain('href=');
    expect(mail.html).not.toContain(acceptUrl);
    expect(mail.text).not.toContain(acceptUrl);
    expect(mail.text).toContain(
      'Ask the person who invited you for a new invitation link.',
    );
  });

  it('escapes malicious task titles in the assignment email', async () => {
    const mail = await render({
      recipient: 'assignee@example.com',
      subject: `New Task Assigned: ${MALICIOUS.quotes}`,
      templateData: {
        fullName: 'Grace',
        taskTitle: `${MALICIOUS.tag}${MALICIOUS.quotes}`,
        taskId: 'task-1',
      },
    });

    expect(stripTemplateMarkup(mail.html)).not.toMatch(/[<>]/);
    // The assignment template has no links, so no real anchor may appear.
    expect(mail.html).not.toMatch(/<a\s/);
    expect(mail.html).toContain(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    );
  });

  it('removes CR/LF from user-controlled subjects', async () => {
    const mail = await render({
      recipient: 'member@example.com',
      subject: 'You were invited to Team\r\nBcc: victim@example.com',
      templateData: {
        type: 'workspace-invitation',
        fullName: 'Ada',
        workspaceName: 'Team',
        expiresAt: '2026-12-02T12:00:00.000Z',
        acceptUrl: 'https://app.example.com/workspaces',
      },
    });

    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject).toBe(
      'You were invited to Team Bcc: victim@example.com',
    );
  });
});

describe('EmailProcessor logging', () => {
  const processor = new EmailProcessor();
  const job = {
    data: {
      recipient: 'alice.private@example.com',
      subject: 'New Task Assigned',
      templateData: { fullName: 'Alice', taskTitle: 'Ship', taskId: 't1' },
    },
  } as Job<never>;
  let infoLog: jest.SpyInstance;
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    sendMail.mockReset();
    infoLog = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const logged = (spy: jest.SpyInstance) =>
    spy.mock.calls.flat().map(String).join('\n');

  it('masks the recipient when an email is sent', async () => {
    sendMail.mockResolvedValue({});
    await processor.process(job);

    expect(logged(infoLog)).toBe('Email sent to a***@e***.com.');
  });

  it('masks the recipient and SMTP reply and keeps the error type on failure', async () => {
    const smtpError = Object.assign(
      new Error(
        '550 5.1.1 <alice.private@example.com>: Recipient address rejected',
      ),
      { code: 'EENVELOPE' },
    );
    sendMail.mockRejectedValue(smtpError);

    await expect(processor.process(job)).rejects.toBe(smtpError);

    const text = logged(errorLog);
    expect(text).toContain(
      'Failed to send email to a***@e***.com: Error (code=EENVELOPE)',
    );
    expect(text).toContain('<a***@e***.com>: Recipient address rejected');
    expect(text).toMatch(/\n\s+at\s/); // stack frames kept
    expect(text).not.toContain('alice.private@example.com');
  });
});

describe('EmailProcessor without SMTP configuration', () => {
  const processor = new EmailProcessor();

  afterEach(() => {
    process.env.SMTP_HOST = 'smtp.example.com';
    jest.restoreAllMocks();
  });

  it('never contacts any mail server when SMTP_HOST is not set', async () => {
    const nodemailer = jest.requireMock<{ createTransport: jest.Mock }>(
      'nodemailer',
    );
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    process.env.SMTP_HOST = '';
    nodemailer.createTransport.mockClear();
    sendMail.mockClear();

    await expect(
      processor.process({
        data: {
          recipient: 'someone@example.com',
          subject: 'Hello',
          templateData: { fullName: 'A', taskTitle: 'T', taskId: 't1' },
        },
      } as Job<never>),
    ).resolves.toEqual({ sent: false });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('greets recipients without an account generically and names the inviter', async () => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await processor.process({
      data: {
        recipient: 'new@example.com',
        subject: 'Invited',
        templateData: {
          type: 'workspace-invitation',
          inviterName: 'Ada',
          workspaceName: 'Design',
          expiresAt: '2026-12-02T12:00:00.000Z',
          acceptUrl: 'https://app.example.com/invite#token',
        },
      },
    } as Job<never>);
    const [mail] = sendMail.mock.calls[0] as [{ text: string; html: string }];
    expect(mail.text.startsWith('Hello,')).toBe(true);
    expect(mail.text).toContain('Ada invited you to join Design');
    expect(mail.html).toContain('href="https://app.example.com/invite#token"');
  });
});
