import type { StreetsFile, StreetEntry } from './lib/types';

export interface Resolved {
  kind: 'resolved';
  rejon: string;
  /** entry used for the decision (undefined when matched via whole locality) */
  entry?: StreetEntry;
  /** true when the region was determined by whole-locality coverage */
  viaLocality: boolean;
}

export interface Ambiguous {
  kind: 'ambiguous';
  candidates: StreetEntry[];
}

export type Resolution = Resolved | Ambiguous;

/**
 * Decide which region an address belongs to.
 * Handles parity (parzyste/nieparzyste) and house-number ranges, and falls
 * back to whole-locality coverage for localities served by a single region.
 */
export function resolveAddress(
  streetsFile: StreetsFile,
  city: string,
  street: string | null,
  numer?: number | null,
): Resolution | null {
  const locality = streetsFile.localities.find((l) => l.miasto === city);
  const hasStreet = street != null && street.trim() !== '';
  if (!hasStreet && locality?.pelny_rejon != null) {
    return { kind: 'resolved', rejon: locality.pelny_rejon, viaLocality: true };
  }
  const candidates = hasStreet
    ? streetsFile.streets.filter((s) => s.miasto === city && s.ulica === street)
    : streetsFile.streets.filter((s) => s.miasto === city);

  if (candidates.length === 0) {
    if (locality?.pelny_rejon != null) return { kind: 'resolved', rejon: locality.pelny_rejon, viaLocality: true };
    return null;
  }
  if (candidates.length === 1) {
    return { kind: 'resolved', rejon: candidates[0].rejon, entry: candidates[0], viaLocality: false };
  }

  // multiple candidates -> try to disambiguate with the house number
  if (numer != null && Number.isFinite(numer)) {
    const parity = numer % 2 === 0 ? 'parzyste' : 'nieparzyste';
    const byParity = candidates.find((c) => c.parzystosc === parity);
    if (byParity) return { kind: 'resolved', rejon: byParity.rejon, entry: byParity, viaLocality: false };
    const byRange = candidates.find((c) => (c.nr_od == null || numer >= c.nr_od) && (c.nr_do == null || numer <= c.nr_do));
    if (byRange) return { kind: 'resolved', rejon: byRange.rejon, entry: byRange, viaLocality: false };
  }

  // whole-locality coverage only helps if every candidate agrees
  const regions = new Set(candidates.map((c) => c.rejon));
  if (regions.size === 1) {
    return { kind: 'resolved', rejon: candidates[0].rejon, entry: candidates[0], viaLocality: false };
  }
  return { kind: 'ambiguous', candidates };
}

/** Human-readable condition for a candidate entry. */
export function describeEntry(entry: StreetEntry): string {
  if (entry.parzystosc) return `numery ${entry.parzystosc}`;
  if (entry.nr_od != null && entry.nr_do != null) {
    return entry.nr_od === entry.nr_do ? `numer ${entry.nr_od}` : `numery ${entry.nr_od}-${entry.nr_do}`;
  }
  if (entry.nr_od != null) return `numery od ${entry.nr_od}`;
  if (entry.nr_do != null) return `numery do ${entry.nr_do}`;
  return 'cała ulica';
}
