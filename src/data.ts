import type { IndexFile, RegionsFile, StreetsFile, RegionData, YearIndexEntry, Fraction } from './lib/types';

const BASE = import.meta.env.BASE_URL;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`Nie udało się pobrać ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

export interface LoadedYear {
  entry: YearIndexEntry;
  regions: RegionsFile;
  streets: StreetsFile;
}

let index: IndexFile | null = null;

export async function loadIndex(): Promise<IndexFile> {
  if (!index) index = await fetchJson<IndexFile>('data/index.json');
  return index;
}

export async function loadYear(year: number): Promise<LoadedYear> {
  const idx = await loadIndex();
  const entry = idx.years.find((y) => y.rok === year);
  if (!entry) throw new Error(`Brak danych dla roku ${year}`);
  const [regions, streets] = await Promise.all([
    fetchJson<RegionsFile>(entry.regions),
    fetchJson<StreetsFile>(entry.streets),
  ]);
  return { entry, regions, streets };
}

export function regionById(regions: RegionsFile, rejon: string): RegionData | undefined {
  return regions.regions.find((r) => r.rejon === rejon);
}

export function fractionById(regions: RegionsFile, id: string): Fraction | undefined {
  return regions.fractions.find((f) => f.id === id);
}

/** Absolute URL of his region's subscription feed for a given year. */
export function icsUrl(entry: YearIndexEntry, rejon: string, fractionId?: string): string {
  const file = fractionId ? `rejon-${rejon}-${fractionId}.ics` : `rejon-${rejon}.ics`;
  return new URL(`${BASE}${entry.icsBase}/${file}`, window.location.origin).href;
}
