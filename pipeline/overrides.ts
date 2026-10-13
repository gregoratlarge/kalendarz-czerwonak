import type { StreetEntry } from '../src/lib/types.ts';

/**
 * Verified quirks in the gmina's source data (see pipeline cross-validation):
 *
 * - `rejonyczerwonak.xlsx` spells one Kicin street two ways
 *   ("Ks. Ludwika Haasego" / "Hassego"); the PDF uses "Hassego".
 * - Region 13 lists the same street three ways ("Juliusz Słowackiego",
 *   "Juliusza Słowackiego", "Juliusza Slowackiego"); canonical form kept.
 * - `Malinowa` is present in the Region 7 PDF header but missing from the XLSX.
 *
 * Aliases are keyed by normalised street name (see text.ts `norm`).
 */
export const STREET_ALIASES: Record<string, string> = {
  'ks ludwika haasego': 'ks ludwika hassego',
  'juliusz slowackiego': 'juliusza slowackiego',
};

/** Streets present in the source PDFs but absent from the spreadsheet. */
export const EXTRA_STREETS: StreetEntry[] = [
  { miasto: 'Czerwonak', ulica: 'Malinowa', rejon: 7 },
];
