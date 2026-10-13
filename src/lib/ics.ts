// Minimal, dependency-free iCalendar (RFC 5545) writer for all-day events.
// Shared between the build pipeline (Node) and the browser app.

export interface IcsEvent {
  /** globally unique id */
  uid: string;
  /** all-day date, "YYYY-MM-DD" */
  date: string;
  /** event summary / title */
  summary: string;
  description?: string;
  categories?: string[];
}

export interface IcsCalendar {
  /** calendar display name (X-WR-CALNAME) */
  name: string;
  description?: string;
  events: IcsEvent[];
  /** PRODID; defaults to the project identifier */
  prodId?: string;
  /** when true, add refresh hints for subscribed clients */
  subscribeHints?: boolean;
}

/** Escape a text value for an iCalendar property. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold a content line to max 75 octets, per RFC 5545 (UTF-8 aware). */
function foldLine(line: string): string {
  const utf8 = new TextEncoder();
  const bytes = utf8.encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let currentLen = 0;
  // split into code points to keep multi-byte chars intact
  for (const ch of line) {
    const chLen = utf8.encode(ch).length;
    // continuation lines start with a single space which counts toward the 75
    const limit = out.length === 0 ? 75 : 74;
    if (currentLen + chLen > limit) {
      out.push(current);
      current = '';
      currentLen = 0;
    }
    current += ch;
    currentLen += chLen;
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

/** Add one day to a "YYYY-MM-DD" date (for the exclusive DTEND). */
export function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Generate a complete VCALENDAR string with CRLF line endings. */
export function generateIcs(cal: IcsCalendar): string {
  const prodId = cal.prodId ?? '-//kalendarz-czerwonak//Odpady Czerwonak//PL';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(cal.name)}`,
    'X-WR-TIMEZONE:Europe/Warsaw',
  ];
  if (cal.description) lines.push(`X-WR-CALDESC:${escapeText(cal.description)}`);
  if (cal.subscribeHints !== false) {
    lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT24H');
    lines.push('X-PUBLISHED-TTL:PT24H');
  }

  for (const ev of cal.events) {
    const ymd = ev.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    // deterministic DTSTAMP derived from the event date keeps builds reproducible
    lines.push(`DTSTAMP:${ymd}T000000Z`);
    lines.push(`DTSTART;VALUE=DATE:${ymd}`);
    lines.push(`DTEND;VALUE=DATE:${nextDay(ev.date).replace(/-/g, '')}`);
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.categories?.length) lines.push(`CATEGORIES:${ev.categories.map(escapeText).join(',')}`);
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
