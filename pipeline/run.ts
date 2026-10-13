import { mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseRegionPdf } from './pdf.ts';
import { parseStreetsXlsx } from './xlsx.ts';
import { buildRegionFeed, buildFractionFeed } from './generate-ics.ts';
import { FRACTIONS } from './constants.ts';
import type { RegionsFile, StreetsFile, IndexFile, YearIndexEntry } from '../src/lib/types.ts';

const ROOT = process.cwd();
const SOURCE = join(ROOT, 'source_data');
const PUBLIC = join(ROOT, 'public');
const REGION_COUNT = 13;

function discoverYears(): number[] {
  return readdirSync(SOURCE)
    .filter((name) => /^\d{4}$/.test(name) && existsSync(join(SOURCE, name)))
    .map(Number)
    .sort((a, b) => a - b);
}

async function buildYear(rok: number): Promise<YearIndexEntry> {
  const dir = join(SOURCE, String(rok));
  console.log(`\n=== Rok ${rok} ===`);

  const regions = [];
  for (let r = 1; r <= REGION_COUNT; r++) {
    const pdfPath = join(dir, `rejon${r}.pdf`);
    if (!existsSync(pdfPath)) {
      console.warn(`  ! brak pliku ${pdfPath}`);
      continue;
    }
    const region = await parseRegionPdf(pdfPath, r);
    const total = FRACTIONS.reduce((acc, f) => acc + region.schedule[f.id].flat().length, 0);
    console.log(`  Rejon ${String(r).padStart(2)} | ${region.lokalizacje.slice(0, 60)} | ${total} terminów`);
    regions.push(region);
  }

  const xlsxPath = join(dir, 'rejonyczerwonak.xlsx');
  const { streets, localities, warnings } = parseStreetsXlsx(xlsxPath);
  if (warnings.length) warnings.forEach((w) => console.warn('  ! ' + w));

  // --- validation: compare street count per region against PDF header text ---
  for (const region of regions) {
    const count = streets.filter((s) => s.rejon === region.rejon).length;
    if (count === 0) console.warn(`  ! Rejon ${region.rejon}: brak ulic w arkuszu`);
  }
  // detect streets that resolve to more than one region without a distinguishing qualifier
  const ambig = new Map<string, Set<number>>();
  for (const s of streets) {
    const key = `${s.miasto}|${s.ulica}`;
    if (!ambig.has(key)) ambig.set(key, new Set());
    ambig.get(key)!.add(s.rejon);
  }
  for (const [key, set] of ambig) {
    if (set.size > 1) console.log(`  i ulica współdzielona (wymaga numeru/parzystości): ${key} -> rejony ${[...set].join(', ')}`);
  }

  const regionsFile: RegionsFile = { rok, fractions: FRACTIONS, regions };
  const streetsFile: StreetsFile = { rok, localities, streets };

  const yearDataDir = join(PUBLIC, 'data', String(rok));
  const yearIcsDir = join(PUBLIC, 'ics', String(rok));
  mkdirSync(yearDataDir, { recursive: true });
  rmSync(yearIcsDir, { recursive: true, force: true });
  mkdirSync(yearIcsDir, { recursive: true });

  writeFileSync(join(yearDataDir, 'regions.json'), JSON.stringify(regionsFile, null, 2) + '\n');
  writeFileSync(join(yearDataDir, 'streets.json'), JSON.stringify(streetsFile, null, 2) + '\n');

  let feedCount = 0;
  for (const region of regions) {
    const feed = buildRegionFeed(region, rok);
    writeFileSync(join(yearIcsDir, feed.filename), feed.content);
    feedCount++;
    for (const fraction of FRACTIONS) {
      const ff = buildFractionFeed(region, rok, fraction.id);
      if (ff) {
        writeFileSync(join(yearIcsDir, ff.filename), ff.content);
        feedCount++;
      }
    }
  }
  console.log(`  Zapisano regions.json, streets.json (${streets.length} ulic, ${localities.length} miejscowości) oraz ${feedCount} plików .ics`);

  return { rok, regions: `data/${rok}/regions.json`, streets: `data/${rok}/streets.json`, icsBase: `ics/${rok}` };
}

async function main() {
  const years = discoverYears();
  if (years.length === 0) throw new Error('Brak katalogów z danymi w source_data/');
  const index: YearIndexEntry[] = [];
  for (const year of years) index.push(await buildYear(year));

  const indexFile: IndexFile = { gmina: 'Czerwonak', years: index };
  mkdirSync(join(PUBLIC, 'data'), { recursive: true });
  writeFileSync(join(PUBLIC, 'data', 'index.json'), JSON.stringify(indexFile, null, 2) + '\n');
  console.log(`\nGotowe. Lata: ${years.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
