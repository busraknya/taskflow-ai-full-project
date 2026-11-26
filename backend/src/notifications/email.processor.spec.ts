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

describe('EmailProcessor HTML escaping', () => {
  const processor = new EmailProcessor();

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({});
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
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
      'Sign in to accept the invitation: https://app.example.com/workspaces',
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
      'Sign in to TaskFlow AI to accept the invitation.',
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
