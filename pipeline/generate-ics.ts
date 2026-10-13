import { FRACTIONS, MONTHS } from './constants.ts';
import { generateIcs, type IcsEvent } from '../src/lib/ics.ts';
import type { RegionData } from '../src/lib/types.ts';

const UID_DOMAIN = 'gregoratlarge.github.io';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function isoDate(rok: number, monthIndex: number, day: number): string {
  return `${rok}-${pad(monthIndex + 1)}-${pad(day)}`;
}

/** Build the list of all-day calendar events for one region. */
export function buildRegionEvents(region: RegionData, rok: number): IcsEvent[] {
  const events: IcsEvent[] = [];
  for (const fraction of FRACTIONS) {
    const byMonth = region.schedule[fraction.id];
    if (!byMonth) continue;
    byMonth.forEach((days, m) => {
      for (const day of days) {
        const date = isoDate(rok, m, day);
        events.push({
          uid: `odpady-${rok}-rejon${region.rejon}-${date.replace(/-/g, '')}-${fraction.id}@${UID_DOMAIN}`,
          date,
          summary: fraction.eventTitle,
          categories: [fraction.label],
        });
      }
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.summary.localeCompare(b.summary, 'pl'));
  return events;
}

export interface GeneratedFeed {
  filename: string;
  content: string;
  eventCount: number;
}

/** Generate the "subscribe to the whole region" feed. */
export function buildRegionFeed(region: RegionData, rok: number): GeneratedFeed {
  const events = buildRegionEvents(region, rok);
  const content = generateIcs({
    name: `Odpady Czerwonak - Rejon ${region.rejon} (${rok})`,
    description: `Harmonogram wywozu odpadów - Rejon ${region.rejon}, Gmina Czerwonak, ${rok}`,
    events,
  });
  return { filename: `rejon-${region.rejon}.ics`, content, eventCount: events.length };
}

/** Generate a per-fraction feed for a region (advanced subscription use). */
export function buildFractionFeed(region: RegionData, rok: number, fractionId: string): GeneratedFeed | null {
  const fraction = FRACTIONS.find((f) => f.id === fractionId);
  const byMonth = region.schedule[fractionId];
  if (!fraction || !byMonth) return null;
  const all = buildRegionEvents(region, rok).filter((e) => e.categories?.[0] === fraction.label);
  if (all.length === 0) return null;
  const content = generateIcs({
    name: `Odpady Czerwonak - Rejon ${region.rejon} - ${fraction.label} (${rok})`,
    description: `${fraction.label} - Rejon ${region.rejon}, Gmina Czerwonak, ${rok}`,
    events: all,
  });
  return { filename: `rejon-${region.rejon}-${fractionId}.ics`, content, eventCount: all.length };
}

export { FRACTIONS, MONTHS };
