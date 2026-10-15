import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';
import { MONTHS, COL_BOUNDS, COLUMN_IDS } from './constants.ts';
import type { RegionData } from '../src/lib/types.ts';

interface Frag {
  str: string;
  x: number;
  y: number;
  w: number;
}

interface Line {
  y: number;
  text: string;
}

export interface ParsedRegion {
  region: RegionData;
  /** Raw locality/street description from the PDF header (phone stripped). */
  block: string;
}

const PHONE = /\d{3}[\s-]?\d{3}[\s-]?\d{3}/;

/** Same-line tolerance: fragments whose baselines differ by less than this share a line. */
const LINE_TOL = 3;
/**
 * How far a data fragment may sit from a month row and still belong to it.
 * Cells that wrap to a second line sit ~7 units below the first (row spacing is
 * ~15), while the page footnotes start well below every month row.
 */
const ROW_TOL = 10;

/** Map a token x-position to a fraction id. */
function colForX(x: number): string {
  for (let i = 0; i < COL_BOUNDS.length; i++) {
    if (x < COL_BOUNDS[i]) return COLUMN_IDS[i];
  }
  return COLUMN_IDS[COLUMN_IDS.length - 1];
}

/** Reconstruct human-readable lines from kerning-split fragments. */
function fragmentsToLines(frags: Frag[]): Line[] {
  const lines: Frag[][] = [];
  for (const f of [...frags].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l[0].y - f.y) < LINE_TOL);
    if (line) line.push(f);
    else lines.push([f]);
  }
  return lines
    .map((line) => {
      const sorted = [...line].sort((a, b) => a.x - b.x);
      let text = '';
      let prevEnd = -Infinity;
      for (const f of sorted) {
        if (text && f.x - prevEnd > 1.2) text += ' ';
        text += f.str;
        prevEnd = f.x + f.w;
      }
      return { y: sorted[0].y, text };
    })
    .sort((a, b) => b.y - a.y);
}

export async function parseRegionPdf(path: string, rejon: string): Promise<ParsedRegion> {
  const data = new Uint8Array(readFileSync(path));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const frags: Frag[] = (tc.items as any[])
    .map((it) => ({ str: String(it.str), x: it.transform[4] as number, y: it.transform[5] as number, w: it.width as number }))
    .filter((f) => f.str.trim() !== '')
    .map((f) => ({ ...f, str: f.str.trim() }));

  // Locate the y of every month row present in this document. The source now
  // ships a short schedule (three months), so the set of months is whatever the
  // PDF actually contains - never assume all twelve.
  const labelLines = fragmentsToLines(frags.filter((f) => f.x < 100));
  const monthY: number[] = new Array(12).fill(NaN);
  const present: number[] = [];
  for (let m = 0; m < 12; m++) {
    const name = MONTHS[m].toLowerCase();
    const line = labelLines.find((l) => l.text.trim().toLowerCase() === name);
    if (line) {
      monthY[m] = line.y;
      present.push(m);
    }
  }
  if (present.length === 0) throw new Error(`${path}: nie znaleziono żadnego wiersza miesiąca`);

  // schedule[fractionId] = 12 month buckets (only the present months are filled)
  const schedule: Record<string, number[][]> = Object.fromEntries(
    COLUMN_IDS.map((id) => [id, Array.from({ length: 12 }, () => [] as number[])]),
  );
  const mycieMiesiace: number[] = [];

  // Group the data fragments by (column, month row) so a date split across two
  // fragments - e.g. "1" and "7" rendered 6 units apart - is read back as "17"
  // instead of two separate days. Reading order is top-to-bottom, then left.
  const grouped = new Map<string, Frag[]>();
  for (const f of frags) {
    if (f.x < 100) continue; // month label column
    let best = -1;
    let bestD = Infinity;
    for (const m of present) {
      const d = Math.abs(f.y - monthY[m]);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    if (best < 0 || bestD > ROW_TOL) continue;
    const key = `${colForX(f.x)}\u0000${best}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(f);
    else grouped.set(key, [f]);
  }

  for (const [key, bucket] of grouped) {
    const [col, monthStr] = key.split('\u0000');
    const m = Number(monthStr);
    const text = [...bucket]
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((f) => f.str)
      .join('');
    const digits = text.match(/\d+/g);
    if (col === 'mycie_pojemnikow') {
      if (digits) schedule[col][m].push(...digits.map(Number));
      else mycieMiesiace.push(m);
      continue;
    }
    if (digits) schedule[col][m].push(...digits.map(Number));
  }
  for (const id of COLUMN_IDS) {
    for (let m = 0; m < 12; m++) schedule[id][m] = [...new Set(schedule[id][m])].sort((a, b) => a - b);
  }
  mycieMiesiace.sort((a, b) => a - b);

  // Header text: everything above the first (highest) month row.
  const tableTop = Math.max(...present.map((m) => monthY[m])) + 7;
  const headerLines = fragmentsToLines(frags.filter((f) => f.y > tableTop));
  const headerText = headerLines.map((l) => l.text).join(' ');
  const kontakt = headerText.match(PHONE)?.[0] ?? null;

  // The locality block sits between the "HARMONOGRAM NR n" line and the
  // "Daty odbioru" line (the old "Rejon n" line no longer exists).
  const harm = headerLines.find((l) => /HARMONOGRAM NR/i.test(l.text));
  const daty = headerLines.find((l) => /Daty odbioru/i.test(l.text));
  if (!harm || !daty) throw new Error(`${path}: nie znaleziono nagłówka harmonogramu`);
  const block = headerLines
    .filter((l) => l.y < harm.y && l.y > daty.y)
    .map((l) => l.text)
    .join(' ')
    .replace(new RegExp(PHONE.source, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  await doc.destroy();

  // sanity check
  if (schedule.zmieszane.every((m) => m.length === 0)) {
    throw new Error(`${path}: no mixed-waste dates parsed`);
  }

  return { region: { rejon, lokalizacje: block, kontakt, schedule, mycieMiesiace }, block };
}
