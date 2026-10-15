import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IndexFile, RegionsFile, StreetsFile } from '../src/lib/types';

const ROOT = process.cwd();
const YEAR = 2026;
const dataDir = join(ROOT, 'public', 'data', String(YEAR));
const icsDir = join(ROOT, 'public', 'ics', String(YEAR));

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const index = readJson<IndexFile>(join(ROOT, 'public', 'data', 'index.json'));
const regions = readJson<RegionsFile>(join(dataDir, 'regions.json'));
const streets = readJson<StreetsFile>(join(dataDir, 'streets.json'));

const daysInMonth = (monthIndex: number): number => new Date(Date.UTC(YEAR, monthIndex + 1, 0)).getUTCDate();

describe('index.json', () => {
  it('lists the parsed years', () => {
    expect(index.gmina).toBe('Czerwonak');
    expect(index.years.map((y) => y.rok)).toContain(YEAR);
  });
});

describe('regions.json', () => {
  it('contains the 12 regions of the current schedule', () => {
    expect(regions.regions).toHaveLength(12);
    expect(regions.regions.map((r) => r.rejon)).toEqual(['1', '2a', '2b', '3', '4', '5', '6a', '6b', '7', '8', '9', '10']);
  });

  it('covers only October to December 2026', () => {
    expect(regions.miesiace).toEqual([9, 10, 11]);
  });

  it('defines the 8 source fractions with the "Odpady: " prefix', () => {
    expect(regions.fractions).toHaveLength(8);
    for (const f of regions.fractions) {
      expect(f.eventTitle.startsWith('Odpady: ')).toBe(true);
    }
    expect(regions.fractions.map((f) => f.label)).toContain('Bioodpady - drzewka świąteczne');
  });

  it('has 12 valid month buckets per fraction per region', () => {
    for (const region of regions.regions) {
      for (const fraction of regions.fractions) {
        const byMonth = region.schedule[fraction.id];
        expect(byMonth, `rejon ${region.rejon} / ${fraction.id}`).toHaveLength(12);
        byMonth.forEach((days, m) => {
          for (const day of days) {
            expect(day).toBeGreaterThanOrEqual(1);
            expect(day).toBeLessThanOrEqual(daysInMonth(m));
          }
        });
      }
    }
  });

  it('fills only the covered months', () => {
    const covered = new Set(regions.miesiace);
    for (const region of regions.regions) {
      for (const fraction of regions.fractions) {
        region.schedule[fraction.id].forEach((days, m) => {
          if (!covered.has(m)) expect(days, `rejon ${region.rejon} / ${fraction.id} / ${m}`).toHaveLength(0);
        });
      }
    }
  });

  it('reads dates split into two glyph fragments as one day', () => {
    // The October wystawkowe cell is rendered as "1" + "7" (rejon 7) and
    // "2" + "1" (rejon 8); a naive per-fragment read yields [1, 7] / [2, 1].
    const r7 = regions.regions.find((r) => r.rejon === '7')!;
    const r8 = regions.regions.find((r) => r.rejon === '8')!;
    expect(r7.schedule.odpady_wystawkowe[9]).toContain(17);
    expect(r8.schedule.odpady_wystawkowe[9]).toContain(21);
  });

  it('schedules no Christmas trees in the October-December period', () => {
    for (const region of regions.regions) {
      for (const days of region.schedule.drzewka_swiateczne) expect(days).toHaveLength(0);
    }
  });
});

describe('streets.json', () => {
  it('covers the whole gmina with 17 localities', () => {
    expect(streets.localities.length).toBe(17);
  });

  it('splits Kicin Poznańska by parity', () => {
    const odd = streets.streets.find((s) => s.miasto === 'Kicin' && s.ulica === 'Poznańska' && s.parzystosc === 'nieparzyste');
    const even = streets.streets.find((s) => s.miasto === 'Kicin' && s.ulica === 'Poznańska' && s.parzystosc === 'parzyste');
    expect(odd?.rejon).toBe('1');
    expect(even?.rejon).toBe('2a');
  });

  it('splits Czerwonak Źródlana by house-number range', () => {
    const low = streets.streets.find((s) => s.miasto === 'Czerwonak' && s.ulica === 'Źródlana' && s.nr_do != null);
    const high = streets.streets.find((s) => s.miasto === 'Czerwonak' && s.ulica === 'Źródlana' && s.nr_od != null);
    expect(low).toMatchObject({ rejon: '8', nr_do: 72 });
    expect(high).toMatchObject({ rejon: '9', nr_od: 74 });
  });

  it('keeps Błękitna number 10 in region 7 and everything else in region 9', () => {
    const ten = streets.streets.find((s) => s.miasto === 'Czerwonak' && s.ulica === 'Błękitna' && s.nr_od === 10);
    expect(ten).toMatchObject({ rejon: '7', nr_do: 10 });
    const rest = streets.streets.filter((s) => s.miasto === 'Czerwonak' && s.ulica === 'Błękitna' && s.rejon === '9');
    expect(rest.length).toBeGreaterThan(0);
  });

  it('includes the Malinowa street listed in the region 7 header', () => {
    expect(streets.streets).toContainEqual({ miasto: 'Czerwonak', ulica: 'Malinowa', rejon: '7' });
  });
});

describe('generated ICS feeds', () => {
  function parseIcs(text: string) {
    const lines = text.split('\r\n').filter((l) => l !== '');
    // unfold continuation lines
    const unfolded: string[] = [];
    for (const line of lines) {
      if (line.startsWith(' ') && unfolded.length) unfolded[unfolded.length - 1] += line.slice(1);
      else unfolded.push(line);
    }
    return unfolded;
  }

  it('exists for every region and balances VEVENT blocks', () => {
    for (const region of regions.regions) {
      const path = join(icsDir, `rejon-${region.rejon}.ics`);
      expect(existsSync(path), path).toBe(true);
      const lines = parseIcs(readFileSync(path, 'utf8'));
      expect(lines[0]).toBe('BEGIN:VCALENDAR');
      expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
      const begins = lines.filter((l) => l === 'BEGIN:VEVENT').length;
      const ends = lines.filter((l) => l === 'END:VEVENT').length;
      expect(begins).toBe(ends);
      expect(begins).toBeGreaterThan(0);
      const starts = lines.filter((l) => l.startsWith('DTSTART;VALUE=DATE:')).length;
      expect(starts).toBe(begins);
    }
  });

  it('names the calendar with the display form of the region (2a -> 2A)', () => {
    const text = readFileSync(join(icsDir, 'rejon-2a.ics'), 'utf8');
    expect(text).toContain('X-WR-CALNAME:Odpady Czerwonak - Rejon 2A (2026)');
  });

  it('schedules every event inside October-December 2026', () => {
    const covered = new Set(regions.miesiace.map((m) => m + 1));
    for (const region of regions.regions) {
      const text = readFileSync(join(icsDir, `rejon-${region.rejon}.ics`), 'utf8');
      for (const m of text.matchAll(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/g)) {
        expect(m[1]).toBe('2026');
        expect(covered.has(Number(m[2])), `rejon ${region.rejon} -> ${m[0]}`).toBe(true);
      }
    }
  });
});
