import { describe, it, expect } from 'vitest';
import { generateIcs, nextDay } from '../src/lib/ics';

describe('nextDay', () => {
  it('adds one day within a month', () => {
    expect(nextDay('2026-03-05')).toBe('2026-03-06');
  });
  it('rolls over month and year boundaries', () => {
    expect(nextDay('2026-01-31')).toBe('2026-02-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });
});

describe('generateIcs', () => {
  const event = {
    uid: 'test-1@example.org',
    date: '2026-01-08',
    summary: 'Odpady: Zmieszane odpady komunalne',
    categories: ['Zmieszane odpady komunalne'],
  };

  it('produces a valid all-day VEVENT', () => {
    const ics = generateIcs({ name: 'Test', events: [event] });
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260108');
    expect(ics).toContain('DTEND;VALUE=DATE:20260109');
    expect(ics).toContain('SUMMARY:Odpady: Zmieszane odpady komunalne');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('uses CRLF line endings only', () => {
    const ics = generateIcs({ name: 'Test', events: [event] });
    expect(ics.includes('\n')).toBe(true);
    // every LF must be preceded by CR
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('escapes commas, semicolons and newlines', () => {
    const ics = generateIcs({
      name: 'Test',
      events: [{ ...event, description: 'a, b; c\nd' }],
    });
    expect(ics).toContain('DESCRIPTION:a\\, b\\; c\\nd');
  });

  it('folds long lines to at most 75 octets', () => {
    const longTitle = 'Odpady: ' + 'Bardzo długa nazwa frakcji żółć '.repeat(6);
    const ics = generateIcs({ name: 'Test', events: [{ ...event, summary: longTitle }] });
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('keeps multi-byte characters intact when folding', () => {
    const ics = generateIcs({
      name: 'Test',
      events: [{ ...event, summary: 'Odpady: ' + 'ą'.repeat(100) }],
    });
    expect(ics).not.toContain('\uFFFD');
    expect(ics).toContain('ą');
  });
});
