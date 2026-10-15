import { LOCALITIES } from './constants.ts';
import { norm, titleCaseStreet } from './text.ts';
import type { StreetEntry, LocalityEntry, Parzystosc } from '../src/lib/types.ts';

export interface ParsedStreets {
  streets: StreetEntry[];
  localities: LocalityEntry[];
  warnings: string[];
}

interface Section {
  miasto: string;
  tokens: string[];
}

/** Canonical locality spellings, longest first so "Bolechowo-Osiedle" wins over "Bolechowo". */
const DISPLAY_NAMES = [...new Set(Object.values(LOCALITIES))];

/** Diacritic-free, separator-free key used to round-trip a matched name to its display form. */
function looseKey(value: string): string {
  return norm(value).replace(/[^a-z0-9]/g, '');
}

const NAME_BY_KEY = new Map(DISPLAY_NAMES.map((name) => [looseKey(name), name]));

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match any known locality name as a standalone word. Multi-word names tolerate
 * the spacing/spelling of the source ("Bolechowo-Osiedle" / "Bolechowo - Osiedle").
 */
function buildLocalityRegex(): RegExp {
  const alts = [...DISPLAY_NAMES]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.split(/[-\s]+/).map(escapeRe).join('[\\s-]+'));
  return new RegExp(`(?<!\\p{L})(${alts.join('|')})(?!\\p{L})`, 'giu');
}

const LOCALITY_RE = buildLocalityRegex();

/** Split a header block into locality sections, each with its comma-separated street list. */
function splitSections(block: string): Section[] {
  const matches = [...block.matchAll(LOCALITY_RE)];
  const sections: Section[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const miasto = NAME_BY_KEY.get(looseKey(match[0]));
    if (!miasto) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? block.length) : block.length;
    const raw = block
      .slice(start, end)
      .replace(/^\s*[:\u2013-]?\s*/, '')
      .replace(/\s+$/, '');
    const tokens = raw.split(',').map((t) => t.trim()).filter(Boolean);
    sections.push({ miasto, tokens });
  }
  return sections;
}

/** Turn one street token (with its optional qualifiers) into one or more entries. */
function parseStreetToken(raw: string, miasto: string, rejon: string): StreetEntry[] {
  const quals = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const name = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return [];
  const ulica = titleCaseStreet(name);

  for (const q of quals) {
    // "Błękitna (z wyjątkiem nr 10)" -> everything but house number 10.
    const ex = q.match(/z\s*wyj[aą]tkiem\s*nr\.?\s*(\d+)/i);
    if (ex) {
      const n = Number(ex[1]);
      const out: StreetEntry[] = [];
      if (n > 1) out.push({ miasto, ulica, rejon, nr_do: n - 1 });
      out.push({ miasto, ulica, rejon, nr_od: n + 1 });
      return out;
    }
  }

  let parzystosc: Parzystosc | undefined;
  let nr_od: number | undefined;
  let nr_do: number | undefined;
  for (const q of quals) {
    if (/nieparzyste/i.test(q)) parzystosc = 'nieparzyste';
    else if (/parzyste/i.test(q)) parzystosc = 'parzyste';
    const od = q.match(/nr\.?\s*od\s*(\d+)/i);
    const dop = q.match(/nr\.?\s*do\s*(\d+)/i);
    const exact = q.match(/nr\.?\s*(\d+)/i);
    if (od) nr_od = Number(od[1]);
    else if (dop) nr_do = Number(dop[1]);
    else if (exact) {
      nr_od = Number(exact[1]);
      nr_do = Number(exact[1]);
    }
  }

  return [
    {
      miasto,
      ulica,
      rejon,
      ...(parzystosc ? { parzystosc } : {}),
      ...(nr_od != null ? { nr_od } : {}),
      ...(nr_do != null ? { nr_do } : {}),
    },
  ];
}

/**
 * Build the street -> region map straight from the PDF headers. Each region's
 * header enumerates every locality and street it serves, so the schedules
 * themselves are the single source of truth.
 */
export function parseStreets(regions: { rejon: string; block: string }[]): ParsedStreets {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const streets: StreetEntry[] = [];
  const cityRegions = new Map<string, Set<string>>();

  const register = (city: string, rejon: string): void => {
    let set = cityRegions.get(city);
    if (!set) {
      set = new Set();
      cityRegions.set(city, set);
    }
    set.add(rejon);
  };

  for (const { rejon, block } of regions) {
    const sections = splitSections(block);
    if (sections.length === 0) warnings.push(`rejon ${rejon}: nie rozpoznano żadnej miejscowości w nagłówku`);
    for (const section of sections) {
      register(section.miasto, rejon);
      for (const token of section.tokens) {
        for (const entry of parseStreetToken(token, section.miasto, rejon)) {
          const key = `${entry.rejon}|${looseKey(entry.miasto)}|${looseKey(entry.ulica)}|${entry.parzystosc ?? ''}|${entry.nr_od ?? ''}|${entry.nr_do ?? ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          streets.push(entry);
        }
      }
    }
  }

  // Stable sort keeps entries that share a street name in region order, which
  // resolve.ts relies on to try the most specific house-number range first.
  streets.sort((a, b) => a.miasto.localeCompare(b.miasto, 'pl') || a.ulica.localeCompare(b.ulica, 'pl'));

  const localities: LocalityEntry[] = [...cityRegions.entries()]
    .map(([miasto, set]) => ({ miasto, pelny_rejon: set.size === 1 ? [...set][0] : null }))
    .sort((a, b) => a.miasto.localeCompare(b.miasto, 'pl'));

  return { streets, localities, warnings };
}
