import { mkdirSync, readdirSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseRegionPdf } from './pdf.ts';
import { parseStreets } from './streets.ts';
import { buildRegionFeed, buildFractionFeed } from './generate-ics.ts';
import { FRACTIONS } from './constants.ts';
import type { RegionsFile, StreetsFile, IndexFile, YearIndexEntry, RegionData } from '../src/lib/types.ts';

const ROOT = process.cwd();
const SOURCE = join(ROOT, 'source_data');
const PUBLIC = join(ROOT, 'public');

interface SourceSet {
  rok: number;
  dir: string;
}

/** Sort region ids naturally: 1, 2a, 2b, 3, ... 10. */
function regionOrder(id: string): [number, string] {
  const m = /^(\d+)(.*)$/.exec(id);
  return m ? [Number(m[1]), m[2]] : [Number.MAX_SAFE_INTEGER, id];
}

/**
 * Collect source directories. A directory is a data set when its name starts
 * with a four-digit year, e.g. "2026" (a full year) or "2026Q4" (a period).
 * Anything else - such as "archiwum" holding retired documents - is ignored.
 */
function discoverSources(): SourceSet[] {
  const sets: SourceSet[] = [];
  for (const name of readdirSync(SOURCE)) {
    const m = /^(\d{4})/.exec(name);
    if (!m) continue;
    const full = join(SOURCE, name);
    if (!statSync(full).isDirectory()) continue;
    const rok = Number(m[1]);
    if (sets.some((s) => s.rok === rok)) throw new Error(`source_data: dwa katalogi dla roku ${rok}`);
    sets.push({ rok, dir: full });
  }
  return sets.sort((a, b) => a.rok - b.rok);
}

async function buildYear(set: SourceSet): Promise<YearIndexEntry> {
  const { rok, dir } = set;
  console.log(`\n=== ${rok} (${dir.replace(ROOT + '/', '')}) ===`);

  const regionFiles = readdirSync(dir)
    .filter((f) => /^rejon.+\.pdf$/i.test(f))
    .map((f) => ({ id: (/^rejon(.+)\.pdf$/i.exec(f) as RegExpExecArray)[1].toLowerCase(), file: f }))
    .sort((a, b) => {
      const [na, sa] = regionOrder(a.id);
      const [nb, sb] = regionOrder(b.id);
      return na - nb || sa.localeCompare(sb);
    });
  if (regionFiles.length === 0) throw new Error(`brak plików rejon*.pdf w ${dir}`);

  const regions: RegionData[] = [];
  const blocks: { rejon: string; block: string }[] = [];
  const months = new Set<number>();

  for (const { id, file } of regionFiles) {
    const parsed = await parseRegionPdf(join(dir, file), id);
    regions.push(parsed.region);
    blocks.push({ rejon: id, block: parsed.block });
    for (let m = 0; m < 12; m++) {
      if (FRACTIONS.some((f) => parsed.region.schedule[f.id][m].length) || parsed.region.mycieMiesiace.includes(m)) {
        months.add(m);
      }
    }
    const total = FRACTIONS.reduce((acc, f) => acc + parsed.region.schedule[f.id].flat().length, 0);
    console.log(`  Rejon ${id.padEnd(3)} | ${parsed.region.lokalizacje.slice(0, 58)} | ${total} terminów`);
  }
  const miesiace = [...months].sort((a, b) => a - b);

  const { streets, localities, warnings } = parseStreets(blocks);
  if (warnings.length) warnings.forEach((w) => console.warn('  ! ' + w));

  // --- validation ---
  for (const region of regions) {
    const count = streets.filter((s) => s.rejon === region.rejon).length;
    if (count === 0) console.warn(`  ! Rejon ${region.rejon}: brak ulic w nagłówku`);
  }
  const ambig = new Map<string, Set<string>>();
  for (const s of streets) {
    const key = `${s.miasto}|${s.ulica}`;
    if (!ambig.has(key)) ambig.set(key, new Set());
    ambig.get(key)!.add(s.rejon);
  }
  for (const [key, set] of ambig) {
    if (set.size > 1) console.log(`  i ulica współdzielona (wymaga numeru/parzystości): ${key} -> rejony ${[...set].join(', ')}`);
  }

  const regionsFile: RegionsFile = { rok, miesiace, fractions: FRACTIONS, regions };
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
  console.log(
    `  Zapisano regions.json, streets.json (${streets.length} ulic, ${localities.length} miejscowości, ${miesiace.length} miesięcy) oraz ${feedCount} plików .ics`,
  );

  return { rok, regions: `data/${rok}/regions.json`, streets: `data/${rok}/streets.json`, icsBase: `ics/${rok}` };
}

async function main() {
  const sets = discoverSources();
  if (sets.length === 0) throw new Error('Brak katalogów z danymi w source_data/');
  const index: YearIndexEntry[] = [];
  for (const set of sets) index.push(await buildYear(set));

  const indexFile: IndexFile = { gmina: 'Czerwonak', years: index };
  mkdirSync(join(PUBLIC, 'data'), { recursive: true });
  writeFileSync(join(PUBLIC, 'data', 'index.json'), JSON.stringify(indexFile, null, 2) + '\n');

  // Drop public/data + public/ics directories that no longer have a source set.
  const keep = new Set(sets.map((s) => String(s.rok)));
  for (const area of ['data', 'ics']) {
    const root = join(PUBLIC, area);
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (name === 'index.json' || keep.has(name) || !statSync(join(root, name)).isDirectory()) continue;
      rmSync(join(root, name), { recursive: true, force: true });
      console.log(`Usunięto nieaktualne public/${area}/${name}`);
    }
  }

  console.log(`\nGotowe. Lata: ${sets.map((s) => s.rok).join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
