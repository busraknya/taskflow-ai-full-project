/**
 * Context-specific encoders for email templates. Template data is stored raw
 * in the job and encoded exactly once, at render time, for the context it is
 * inserted into (HTML text/attribute, URL, header).
 */

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Strings pass through; numbers/booleans are stringified; anything else is ''. */
function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

/**
 * Escapes a value for HTML text content and for double- or single-quoted
 * attribute values. Not sufficient on its own for URLs (see safeHttpUrl).
 */
export function escapeHtml(value: unknown): string {
  const text = toText(value);
  return text.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

/**
 * Returns a normalized absolute http(s) URL, or null for anything else
 * (javascript:, data:, vbscript:, relative or malformed values). The result
 * must still be passed through escapeHtml before being placed in an href.
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    // Credentials in links are a classic phishing vector.
    if (url.username || url.password) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Makes user-controlled text safe for a single-line email header such as the
 * subject: removes CR/LF and other control characters, collapses whitespace
 * and limits the length.
 */
export function sanitizeHeaderText(value: unknown, maxLength = 150): string {
  const text = toText(value);
  // eslint-disable-next-line no-control-regex
  const singleLine = text.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ');
  const collapsed = singleLine.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength - 1).trimEnd()}…`
    : collapsed;
}
