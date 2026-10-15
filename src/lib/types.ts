// Shared types used by both the build pipeline and the browser app.

export type Parzystosc = 'parzyste' | 'nieparzyste';

export interface Fraction {
  /** stable id, e.g. "zmieszane" */
  id: string;
  /** wording exactly as in the source PDF column header */
  label: string;
  /** event summary, always prefixed with "Odpady: " */
  eventTitle: string;
  /** "odbiór" = waste collection, "mycie" = container washing (service) */
  kategoria: 'odbiór' | 'mycie';
  color: string;
}

export interface RegionData {
  /**
   * Region id as it appears in the source file name, e.g. "1", "2a", "6b".
   * Kept as a string because several regions share a number.
   */
  rejon: string;
  /** raw localities/streets description from the PDF header */
  lokalizacje: string;
  /** contractor phone number, if present */
  kontakt: string | null;
  /**
   * schedule[fractionId][monthIndex] = list of days-of-month.
   * monthIndex is 0-based (0 = January). Months not covered by this schedule
   * stay empty.
   */
  schedule: Record<string, number[][]>;
  /** 0-based months where container washing is marked but no day is given */
  mycieMiesiace: number[];
}

export interface RegionsFile {
  rok: number;
  /** 0-based months the schedule covers, e.g. [9, 10, 11] for October-December */
  miesiace: number[];
  fractions: Fraction[];
  regions: RegionData[];
}

export interface StreetEntry {
  miasto: string;
  ulica: string;
  /** region id, e.g. "1", "2a", "6b" */
  rejon: string;
  parzystosc?: Parzystosc;
  nr_od?: number;
  nr_do?: number;
}

export interface LocalityEntry {
  miasto: string;
  /** region covering the whole locality (all streets), or null if split */
  pelny_rejon: string | null;
}

export interface StreetsFile {
  rok: number;
  localities: LocalityEntry[];
  streets: StreetEntry[];
}

export interface YearIndexEntry {
  rok: number;
  regions: string;
  streets: string;
  icsBase: string;
}

export interface IndexFile {
  gmina: string;
  years: YearIndexEntry[];
}
