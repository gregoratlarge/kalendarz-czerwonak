import XLSX from 'xlsx';
import { LOCALITIES } from './constants.ts';
import { norm, titleCaseStreet } from './text.ts';
import { STREET_ALIASES, EXTRA_STREETS } from './overrides.ts';
import type { StreetEntry, LocalityEntry, Parzystosc } from '../src/lib/types.ts';

export interface ParsedStreets {
  streets: StreetEntry[];
  localities: LocalityEntry[];
  warnings: string[];
}

interface ParsedStreet {
  ulica: string;
  parzystosc?: Parzystosc;
  nr_od?: number;
  nr_do?: number;
}

/** Extract a street name plus any parity / house-number qualifier. */
function parseStreet(raw: string): ParsedStreet {
  let s = raw.trim();
  let parzystosc: Parzystosc | undefined;
  if (/\(NIEPARZYSTE\)/i.test(s)) parzystosc = 'nieparzyste';
  else if (/\(PARZYSTE\)/i.test(s)) parzystosc = 'parzyste';

  const odM = s.match(/\(OD\s*NR\.?\s*(\d+)\)/i);
  const doM = s.match(/\(DO\s*NR\.?\s*(\d+)\)/i);

  s = s
    .replace(/\([^)]*\)/g, ' ') // drop all parenthetical qualifiers
    .replace(/\bNR\.?\s*GEOD\.?/gi, ' ') // "NR GEOD."
    .replace(/\s+\d+[A-Za-z]?$/, '') // trailing property number, e.g. "JAŚMINOWA 19"
    .replace(/[.,;/]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    ulica: titleCaseStreet(s),
    parzystosc,
    nr_od: odM ? Number(odM[1]) : undefined,
    nr_do: doM ? Number(doM[1]) : undefined,
  };
}

/**
 * Parse the "Opis rejonow" spreadsheet: one column per region, with locality
 * names acting as section markers inside each column.
 */
export function parseStreetsXlsx(path: string): ParsedStreets {
  const wb = XLSX.readFile(path);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: (string | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });

  const header = rows[0] ?? [];
  const regionByCol: (number | null)[] = header.map((h) => {
    const m = String(h ?? '').match(/(\d+)/);
    return m ? Number(m[1]) : null;
  });

  const currentCity: (string | null)[] = [];
  for (let c = 0; c < regionByCol.length; c++) {
    const v = rows[1]?.[c];
    const city = v ? LOCALITIES[norm(String(v))] : undefined;
    currentCity[c] = city ?? null;
  }

  const seen = new Set<string>();
  const streets: StreetEntry[] = [];
  const warnings: string[] = [];
  const cityRegions = new Map<string, Set<number>>();

  const registerCity = (city: string, rejon: number) => {
    if (!cityRegions.has(city)) cityRegions.set(city, new Set());
    cityRegions.get(city)!.add(rejon);
  };

  for (let c = 0; c < regionByCol.length; c++) {
    if (currentCity[c] && regionByCol[c] != null) registerCity(currentCity[c]!, regionByCol[c]!);
  }

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < regionByCol.length; c++) {
      const rawValue = row[c];
      const rejon = regionByCol[c];
      if (rawValue == null || String(rawValue).trim() === '' || rejon == null) continue;

      const text = String(rawValue).trim();
      const city = LOCALITIES[norm(text)];
      if (city) {
        currentCity[c] = city;
        registerCity(city, rejon);
        continue;
      }
      const cityName = currentCity[c];
      if (!cityName) {
        warnings.push(`kolumna rejonu ${rejon}: brak miejscowości dla "${text}"`);
        continue;
      }
      const parsed = parseStreet(text);
      if (!parsed.ulica) continue;
      const key = `${rejon}|${norm(cityName)}|${norm(parsed.ulica)}|${parsed.parzystosc ?? ''}|${parsed.nr_od ?? ''}|${parsed.nr_do ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      streets.push({
        miasto: cityName,
        ulica: parsed.ulica,
        rejon,
        ...(parsed.parzystosc ? { parzystosc: parsed.parzystosc } : {}),
        ...(parsed.nr_od != null ? { nr_od: parsed.nr_od } : {}),
        ...(parsed.nr_do != null ? { nr_do: parsed.nr_do } : {}),
      });
      registerCity(cityName, rejon);
    }
  }

  streets.sort((a, b) => a.miasto.localeCompare(b.miasto, 'pl') || a.ulica.localeCompare(b.ulica, 'pl'));

  // apply verified source-data aliases (merge spelling variants)
  const displayByKey = new Map<string, string>();
  for (const s of streets) if (!displayByKey.has(norm(s.ulica))) displayByKey.set(norm(s.ulica), s.ulica);
  const aliased = streets.map((s) => {
    const target = STREET_ALIASES[norm(s.ulica)];
    return target ? { ...s, ulica: displayByKey.get(target) ?? s.ulica } : s;
  });
  aliased.push(...EXTRA_STREETS);

  const seenFinal = new Set<string>();
  const finalStreets: StreetEntry[] = [];
  for (const s of aliased) {
    const key = `${s.rejon}|${norm(s.miasto)}|${norm(s.ulica)}|${s.parzystosc ?? ''}|${s.nr_od ?? ''}|${s.nr_do ?? ''}`;
    if (seenFinal.has(key)) continue;
    seenFinal.add(key);
    finalStreets.push(s);
    if (!cityRegions.has(s.miasto)) cityRegions.set(s.miasto, new Set());
    cityRegions.get(s.miasto)!.add(s.rejon);
  }
  finalStreets.sort((a, b) => a.miasto.localeCompare(b.miasto, 'pl') || a.ulica.localeCompare(b.ulica, 'pl'));

  const localities: LocalityEntry[] = [...cityRegions.entries()]
    .map(([miasto, regions]) => ({ miasto, pelny_rejon: regions.size === 1 ? [...regions][0] : null }))
    .sort((a, b) => a.miasto.localeCompare(b.miasto, 'pl'));

  return { streets: finalStreets, localities, warnings };
}
