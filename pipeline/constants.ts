import type { Fraction } from '../src/lib/types.ts';

/** Polish month names in calendar order (index 0 = January). */
export const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

/**
 * Waste fractions, in the column order of the source PDFs.
 * `label` is the wording from the source; `eventTitle` is the ICS/calendar title.
 */
export const FRACTIONS: Fraction[] = [
  { id: 'zmieszane', label: 'Zmieszane odpady komunalne', eventTitle: 'Odpady: Zmieszane odpady komunalne', kategoria: 'odbiór', color: '#4b5563' },
  { id: 'papier', label: 'Papier', eventTitle: 'Odpady: Papier', kategoria: 'odbiór', color: '#2563eb' },
  { id: 'metale_i_tworzywa', label: 'Metale i tworzywa sztuczne', eventTitle: 'Odpady: Metale i tworzywa sztuczne', kategoria: 'odbiór', color: '#d97706' },
  { id: 'szklo', label: 'Szkło', eventTitle: 'Odpady: Szkło', kategoria: 'odbiór', color: '#16a34a' },
  { id: 'bioodpady', label: 'Bioodpady', eventTitle: 'Odpady: Bioodpady', kategoria: 'odbiór', color: '#65a30d' },
  { id: 'drzewka_swiateczne', label: 'Bioodpady - drzewka świąteczne', eventTitle: 'Odpady: Bioodpady - drzewka świąteczne', kategoria: 'odbiór', color: '#0d9488' },
  { id: 'odpady_wystawkowe', label: 'Odpady wystawkowe', eventTitle: 'Odpady: Odpady wystawkowe', kategoria: 'odbiór', color: '#dc2626' },
  { id: 'mycie_pojemnikow', label: 'Mycie pojemników', eventTitle: 'Odpady: Mycie pojemników', kategoria: 'mycie', color: '#7c3aed' },
];

export const FRACTION_BY_ID: Record<string, Fraction> = Object.fromEntries(FRACTIONS.map((f) => [f.id, f]));

/**
 * Column x-boundaries (PDF user-space units, origin bottom-left) that map a date
 * token to a fraction. Tuned so every token across all 13 source PDFs sits at
 * least 10 units away from any boundary.
 */
export const COL_BOUNDS = [180, 272, 350, 440, 528, 608, 690];

/** Fraction ids in PDF column order (same as FRACTIONS). */
export const COLUMN_IDS = FRACTIONS.map((f) => f.id);

/** Locality display names keyed by their diacritic-stripped, uppercased key. */
export const LOCALITIES: Record<string, string> = {
  annnowo: 'Annowo',
  annowo: 'Annowo',
  bolechowko: 'Bolechówko',
  bolechowo: 'Bolechowo',
  'bolechowo osiedle': 'Bolechowo-Osiedle',
  'bolechowo-osiedle': 'Bolechowo-Osiedle',
  czerwonak: 'Czerwonak',
  debogora: 'Dębogóra',
  kicin: 'Kicin',
  kliny: 'Kliny',
  kozieglowy: 'Koziegłowy',
  ludwikowo: 'Ludwikowo',
  mielno: 'Mielno',
  miekowo: 'Miękowo',
  owinska: 'Owińska',
  potasze: 'Potasze',
  promnice: 'Promnice',
  szlachecin: 'Szlachęcin',
  trzaskowo: 'Trzaskowo',
};
