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
  it('contains all 13 regions', () => {
    expect(regions.regions).toHaveLength(13);
    expect(regions.regions.map((r) => r.rejon).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1),
    );
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

  it('never schedules Christmas trees outside January', () => {
    for (const region of regions.regions) {
      region.schedule.drzewka_swiateczne.forEach((days, m) => {
        if (m !== 0) expect(days).toHaveLength(0);
      });
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
    expect(odd?.rejon).toBe(1);
    expect(even?.rejon).toBe(2);
  });

  it('splits Czerwonak Źródlana by house-number range', () => {
    const low = streets.streets.find((s) => s.miasto === 'Czerwonak' && s.ulica === 'Źródlana' && s.nr_do != null);
    const high = streets.streets.find((s) => s.miasto === 'Czerwonak' && s.ulica === 'Źródlana' && s.nr_od != null);
    expect(low).toMatchObject({ rejon: 8, nr_do: 73 });
    expect(high).toMatchObject({ rejon: 9, nr_od: 74 });
  });

  it('includes the Malinowa street patched from the PDF header', () => {
    expect(streets.streets).toContainEqual({ miasto: 'Czerwonak', ulica: 'Malinowa', rejon: 7 });
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
});
