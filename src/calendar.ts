import { Calendar, type EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import plLocale from '@fullcalendar/core/locales/pl';
import type { WasteEvent } from './lib/events';

export function createCalendar(el: HTMLElement): Calendar {
  const calendar = new Calendar(el, {
    plugins: [dayGridPlugin, listPlugin],
    initialView: 'dayGridMonth',
    locale: plLocale,
    firstDay: 1,
    height: 'auto',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,listYear',
    },
    buttonText: { today: 'Dziś', month: 'Miesiąc', list: 'Lista' },
    noEventsText: 'Brak odbiorów w tym okresie',
    dayMaxEvents: 4,
    events: [],
  });
  calendar.render();
  return calendar;
}

export function toEventInputs(events: WasteEvent[]): EventInput[] {
  return events.map((e) => ({
    id: e.id,
    title: e.summary,
    start: e.date,
    allDay: true,
    backgroundColor: e.color,
    borderColor: e.color,
    textColor: '#ffffff',
  }));
}
