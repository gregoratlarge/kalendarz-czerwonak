import type { Fraction, RegionData } from './types';

export interface WasteEvent {
  id: string;
  date: string; // YYYY-MM-DD
  summary: string;
  color: string;
  fractionId: string;
  label: string;
}

const UID_DOMAIN = 'gregoratlarge.github.io';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Expand a region's schedule into individual all-day calendar events.
 * `enabled` optionally filters to a subset of fraction ids.
 * Event ids match the ids used by the build pipeline so downloads and
 * subscribed feeds stay consistent.
 */
export function buildWasteEvents(
  region: RegionData,
  year: number,
  fractions: Fraction[],
  enabled?: Set<string>,
): WasteEvent[] {
  const events: WasteEvent[] = [];
  for (const fraction of fractions) {
    if (enabled && !enabled.has(fraction.id)) continue;
    const byMonth = region.schedule[fraction.id];
    if (!byMonth) continue;
    byMonth.forEach((days, m) => {
      for (const day of days) {
        const date = `${year}-${pad(m + 1)}-${pad(day)}`;
        events.push({
          id: `odpady-${year}-rejon${region.rejon}-${date.replace(/-/g, '')}-${fraction.id}@${UID_DOMAIN}`,
          date,
          summary: fraction.eventTitle,
          color: fraction.color,
          fractionId: fraction.id,
          label: fraction.label,
        });
      }
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'pl'));
}
