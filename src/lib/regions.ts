/**
 * Region ids keep the spelling of the source file names ("2a", "6b") because
 * they double as URL/file segments, e.g. ics/2026/rejon-2a.ics. Where a region
 * is shown to a person, use the display form below.
 */

/** Display form of a region id: "2a" -> "2A", "3" -> "3". */
export function regionLabel(rejon: string): string {
  const m = /^(\d+)([a-z]+)$/.exec(rejon);
  return m ? `${m[1]}${m[2].toUpperCase()}` : rejon;
}
