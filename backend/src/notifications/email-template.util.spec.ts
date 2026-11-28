import {
  escapeHtml,
  safeHttpUrl,
  sanitizeHeaderText,
} from './email-template.util';

describe('escapeHtml', () => {
  it('escapes HTML-sensitive characters', () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;',
    );
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Task assigned to Busra')).toBe('Task assigned to Busra');
  });

  it('neutralizes tags with event-handler attributes', () => {
    const escaped = escapeHtml('<img src=x onerror="alert(1)">');
    expect(escaped).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(escaped).not.toMatch(/[<>"]/);
  });

  it('prevents breaking out of quoted attributes', () => {
    for (const payload of [
      `" onmouseover="alert(1)`,
      `' onfocus='alert(1)`,
      `"><svg onload=alert(1)>`,
    ]) {
      const escaped = escapeHtml(payload);
      expect(escaped).not.toContain('"');
      expect(escaped).not.toContain("'");
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
    }
  });

  it('escapes exactly once (no double-escaping of fresh input)', () => {
    // Raw "&lt;" typed by a user must stay visible as "&lt;" in the email.
    expect(escapeHtml('a &lt; b')).toBe('a &amp;lt; b');
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('does not throw on non-string values', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('safeHttpUrl', () => {
  it('accepts absolute http(s) URLs and normalizes them', () => {
    expect(safeHttpUrl('https://app.example.com/workspaces')).toBe(
      'https://app.example.com/workspaces',
    );
    expect(safeHttpUrl(' http://localhost:3000/workspaces ')).toBe(
      'http://localhost:3000/workspaces',
    );
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '/workspaces',
    '//evil.example.com/path',
    'not a url',
    'https://user:pass@evil.example.com/',
    '',
  ])('rejects %p', (value) => {
    expect(safeHttpUrl(value)).toBeNull();
  });

  it('rejects non-string values', () => {
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl({ href: 'https://example.com' })).toBeNull();
  });

  it('percent-encodes characters that could break an attribute', () => {
    const url = safeHttpUrl('https://app.example.com/a"><script>');
    expect(url).not.toBeNull();
    expect(url).not.toContain('"');
    expect(url).not.toContain('<');
  });
});

describe('sanitizeHeaderText', () => {
  it('removes CR/LF so a subject cannot inject headers', () => {
    expect(
      sanitizeHeaderText('Hello\r\nBcc: victim@example.com\r\n\r\nbody'),
    ).toBe('Hello Bcc: victim@example.com body');
  });

  it('strips other control and line-separator characters', () => {
    expect(sanitizeHeaderText('a\u0000b\u0007c\u2028d\u2029e\u007f')).toBe(
      'a b c d e',
    );
  });

  it('collapses whitespace and limits the length', () => {
    expect(sanitizeHeaderText('  many    spaces  ')).toBe('many spaces');
    const long = sanitizeHeaderText('x'.repeat(500), 20);
    expect(long).toHaveLength(20);
    expect(long.endsWith('…')).toBe(true);
  });

  it('keeps ordinary text unchanged', () => {
    expect(sanitizeHeaderText('You were invited to Product Team')).toBe(
      'You were invited to Product Team',
    );
  });
});
