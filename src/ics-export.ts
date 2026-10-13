import { generateIcs } from './lib/ics';
import type { WasteEvent } from './lib/events';

export interface IcsExportInput {
  name: string;
  description?: string;
  events: WasteEvent[];
}

export function wasteEventsToIcs({ name, description, events }: IcsExportInput): string {
  return generateIcs({
    name,
    description,
    events: events.map((e) => ({ uid: e.id, date: e.date, summary: e.summary, categories: [e.label] })),
  });
}

export function downloadText(filename: string, content: string, mime = 'text/calendar;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
