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

/** Map a token x-position to a fraction id. */
function colForX(x: number): string {
  for (let i = 0; i < COL_BOUNDS.length; i++) {
    if (x < COL_BOUNDS[i]) return COLUMN_IDS[i];
  }
  return COLUMN_IDS[COLUMN_IDS.length - 1];
}

/** Reconstruct human-readable lines from kerning-split fragments. */
function fragmentsToLines(frags: Frag[]): string[] {
  const lines: Frag[][] = [];
  for (const f of [...frags].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l[0].y - f.y) < 3);
    if (line) line.push(f);
    else lines.push([f]);
  }
  return lines.map((line) => {
    const sorted = [...line].sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd = -Infinity;
    for (const f of sorted) {
      if (text && f.x - prevEnd > 1.2) text += ' ';
      text += f.str;
      prevEnd = f.x + f.w;
    }
    return text;
  });
}

export async function parseRegionPdf(path: string, rejon: number): Promise<RegionData> {
  const data = new Uint8Array(readFileSync(path));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const frags: Frag[] = (tc.items as any[])
    .map((it) => ({ str: String(it.str), x: it.transform[4] as number, y: it.transform[5] as number, w: it.width as number }))
    .filter((f) => f.str.trim() !== '')
    .map((f) => ({ ...f, str: f.str.trim() }));

  // locate the y of each month row
  const monthY: number[] = [];
  for (const month of MONTHS) {
    const f = frags.find((fr) => fr.str === month) ?? frags.find((fr) => fr.str.startsWith(month));
    if (!f) throw new Error(`${path}: could not find month row "${month}"`);
    monthY.push(f.y);
  }
  const styY = monthY[0];

  // schedule[fractionId] = 12 arrays of days
  const schedule: Record<string, number[][]> = Object.fromEntries(COLUMN_IDS.map((id) => [id, Array.from({ length: 12 }, () => [] as number[])]));
  const mycieMiesiace: number[] = [];

  for (const f of frags) {
    if (f.x < 100) continue; // month label column
    const mi = monthY.findIndex((my) => Math.abs(f.y - my) <= 7);
    if (mi < 0) continue;
    const col = colForX(f.x);
    const digits = f.str.match(/\d+/g);
    if (col === 'mycie_pojemnikow') {
      if (digits) schedule[col][mi].push(...digits.map(Number));
      else mycieMiesiace.push(mi);
      continue;
    }
    if (!digits) continue;
    schedule[col][mi].push(...digits.map(Number));
  }
  for (const id of COLUMN_IDS) {
    for (let m = 0; m < 12; m++) schedule[id][m] = [...new Set(schedule[id][m])].sort((a, b) => a - b);
  }
  mycieMiesiace.sort((a, b) => a - b);

  // header text (everything above the table's first data row), as lines
  const headerLines = fragmentsToLines(frags.filter((f) => f.y > styY + 7));
  const headerText = headerLines.join(' ');
  const phone = /\d{3}[\s-]?\d{3}[\s-]?\d{3}/;
  const kontakt = headerText.match(phone)?.[0] ?? null;

  // locality block sits between the "Rejon N ... rok" line and the "Daty odbioru" line
  const rejonLine = headerLines.find((l) => /Rejon\s*\d+/i.test(l)) ?? '';
  const typ = rejonLine.replace(/Rejon.*$/i, '').replace(phone, '').replace(/\s+/g, ' ').trim();
  const idxRejon = headerLines.indexOf(rejonLine);
  const idxDaty = headerLines.findIndex((l) => /Daty odbioru/i.test(l));
  const lokalizacje = headerLines
    .slice(idxRejon + 1, idxDaty >= 0 ? idxDaty : headerLines.length)
    .join(' ')
    .replace(new RegExp(phone.source, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  await doc.destroy();

  // sanity check
  if (schedule.zmieszane.every((m) => m.length === 0)) {
    throw new Error(`${path}: no mixed-waste dates parsed`);
  }

  return { rejon, typ, lokalizacje, kontakt, schedule, mycieMiesiace };
}
