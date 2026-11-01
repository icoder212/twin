import { describe, expect, it } from 'vitest';
import { detectPii, isValidIban, passesLuhn, redactPii } from '../security/pii';
import { hasHiddenCharacters, sanitizeText, toCsvCell } from '../security/sanitize';
import { isAllowedOrigin, safeUrl } from '../security/url';
import { can } from '../security/rbac';
import { createAnswerId, createId } from '../security/ids';

describe('PII detection', () => {
  it('finds Luhn-valid card numbers and ignores other long numbers', () => {
    expect(passesLuhn('4242 4242 4242 4242')).toBe(true);
    expect(passesLuhn('1234 5678 9012 3456')).toBe(false);
    expect(detectPii('my card is 4242 4242 4242 4242').map((m) => m.kind)).toEqual(['card']);
    expect(detectPii('account 1234 5678 9012 3456')).toEqual([]);
  });

  it('validates IBAN checksums', () => {
    expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(isValidIban('GB82 WEST 1234 5698 7654 33')).toBe(false);
  });

  it('detects emails, secrets and passwords', () => {
    const kinds = detectPii(
      'mail me at a.b@example.com, key sk-live-abcdefghijklmnop1234 and password: hunter22',
    ).map((m) => m.kind);
    expect(kinds).toEqual(['email', 'secret', 'password']);
  });

  it('does not flag prices, times or instrument levels as phone numbers', () => {
    expect(detectPii('/alert EURUSD 1.0900 at 07:30, account 10482')).toEqual([]);
  });

  it('redacts without echoing the raw value', () => {
    const out = redactPii('card 4242 4242 4242 4242 and me@example.com');
    expect(out).toBe('card [card ending 4242] and [email address removed]');
  });
});

describe('sanitizeText', () => {
  it('strips control, bidi and zero-width characters', () => {
    const input = 'buy\u202E now\u200B\u0007 please';
    expect(hasHiddenCharacters(input)).toBe(true);
    expect(sanitizeText(input, { maxLength: 100 })).toBe('buy now please');
  });

  it('limits length and collapses blank lines', () => {
    expect(sanitizeText('a\n\n\n\nb', { maxLength: 100 })).toBe('a\n\nb');
    expect(sanitizeText('abcdef', { maxLength: 3 })).toBe('abc');
    expect(sanitizeText('a\nb', { maxLength: 10, multiline: false })).toBe('a b');
  });
});

describe('CSV export', () => {
  it('neutralises spreadsheet formulas', () => {
    expect(toCsvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(toCsvCell('+1')).toBe("'+1");
    expect(toCsvCell('plain')).toBe('plain');
  });
});

describe('safeUrl', () => {
  it('only allows https and same-origin paths', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('http://example.com')).toBeNull();
    expect(safeUrl('https://user:pw@example.com')).toBeNull();
    expect(safeUrl('//evil.com/x')).toBeNull();
    expect(safeUrl('/approvals')).toBe('/approvals');
    expect(safeUrl('https://www.alchmai.com/desk-twin')).toBe('https://www.alchmai.com/desk-twin');
  });

  it('enforces host allow-lists including subdomains', () => {
    expect(safeUrl('https://docs.alchmai.com', { allowedHosts: ['alchmai.com'] })).not.toBeNull();
    expect(safeUrl('https://alchmai.com.evil.io', { allowedHosts: ['alchmai.com'] })).toBeNull();
  });

  it('compares postMessage origins exactly', () => {
    expect(isAllowedOrigin('https://broker.example', ['https://broker.example'])).toBe(true);
    expect(isAllowedOrigin('https://broker.example.evil.io', ['https://broker.example'])).toBe(
      false,
    );
  });
});

describe('RBAC', () => {
  it('gives compliance export rights but not source management', () => {
    expect(can('compliance', 'audit.export')).toBe(true);
    expect(can('compliance', 'sources.manage')).toBe(false);
    expect(can('trader', 'audit.export')).toBe(false);
    expect(can('admin', 'tenant.configure')).toBe(true);
    expect(can(undefined, 'twin.ask')).toBe(false);
  });
});

describe('ids', () => {
  it('creates readable answer ids and safe opaque ids', () => {
    expect(createAnswerId()).toMatch(/^DT-[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(createId('aut')).toMatch(/^aut_[0-9a-z]{16}$/);
  });
});

describe('phone detection', () => {
  it('finds UK and international numbers', () => {
    expect(detectPii('call 07700 900123').map((m) => m.kind)).toEqual(['phone']);
    expect(detectPii('call +44 20 7946 0958').map((m) => m.kind)).toEqual(['phone']);
  });
});
