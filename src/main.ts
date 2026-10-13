import './styles.css';
import { Combobox } from './combobox';
import { createCalendar, toEventInputs } from './calendar';
import { buildWasteEvents } from './lib/events';
import { wasteEventsToIcs, downloadText } from './ics-export';
import { resolveAddress, describeEntry } from './resolve';
import { loadIndex, loadYear, regionByNumber, icsUrl, type LoadedYear } from './data';
import type { YearIndexEntry, RegionData, StreetEntry } from './lib/types';

const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

const SHORT_FRACTION: Record<string, string> = {
  zmieszane: 'Zmieszane',
  papier: 'Papier',
  metale_i_tworzywa: 'Metale i tworzywa',
  szklo: 'Szkło',
  bioodpady: 'Bioodpady',
  drzewka_swiateczne: 'Drzewka świąteczne',
  odpady_wystawkowe: 'Wystawkowe',
  mycie_pojemnikow: 'Mycie pojemników',
};

const SOURCE_URL =
  'https://czerwonak.pl/pl/mieszkaniec/informacje/aktualnosci/harmonogram-wywozu-odpadow-na-rok-2026/9588';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  year: $<HTMLSelectElement>('year-select'),
  status: $('status'),
  result: $('result'),
  ambiguity: $('ambiguity'),
  numerField: $('numer-field'),
  numer: $<HTMLInputElement>('numer-input'),
  regionTitle: $('region-title'),
  regionMeta: $('region-meta'),
  regionBadge: $('region-badge'),
  calendarNote: $('calendar-note'),
  fractions: $('fractions'),
  scheduleTable: $<HTMLTableElement>('schedule-table'),
  icsLink: $<HTMLAnchorElement>('ics-link'),
  btnGoogle: $<HTMLAnchorElement>('btn-google'),
  btnWebcal: $<HTMLAnchorElement>('btn-webcal'),
  btnDownload: $<HTMLButtonElement>('btn-download'),
  btnCopy: $<HTMLButtonElement>('btn-copy'),
  fractionFeeds: $<HTMLUListElement>('fraction-feeds'),
  sourceLink: $<HTMLAnchorElement>('source-link'),
  calendarHost: $('calendar'),
};

let years: YearIndexEntry[] = [];
let loaded: LoadedYear | null = null;
let currentRegion: RegionData | null = null;
let fractionsInitialised = false;
let enabled = new Set<string>();
let calendar: ReturnType<typeof createCalendar> | null = null;
let streetOptions: StreetEntry[] = [];
let cityValue: string | null = null;
let streetName: string | null = null;

const cityCombo = new Combobox({ placeholder: 'np. Kicin', ariaLabel: 'Miejscowość', onSelect: onCitySelect });
const streetCombo = new Combobox({ placeholder: 'np. Berberysowa', ariaLabel: 'Ulica', onSelect: onStreetSelect });
$('city-combo').append(cityCombo.el);
$('street-combo').append(streetCombo.el);

el.sourceLink.href = SOURCE_URL;

function setStatus(text: string): void {
  el.status.textContent = text;
}

function hideResult(): void {
  el.result.hidden = true;
  el.ambiguity.hidden = true;
  currentRegion = null;
}

function fractionHint(entry: StreetEntry): string {
  const parts = [`Rejon ${entry.rejon}`];
  const qualifier = describeEntry(entry);
  if (qualifier !== 'cała ulica') parts.push(qualifier);
  return parts.join(' · ');
}

function selectCity(city: string, auto = true): void {
  if (!loaded) return;
  const locality = loaded.streets.localities.find((l) => l.miasto === city);
  cityValue = city;
  cityCombo.setValue(city);
  streetOptions = loaded.streets.streets.filter((s) => s.miasto === city);
  streetCombo.setItems(streetOptions.map((s, i) => ({ value: String(i), label: s.ulica, hint: fractionHint(s) })));
  streetCombo.setDisabled(false);
  streetName = null;
  el.numerField.hidden = true;
  el.numer.value = '';
  el.ambiguity.hidden = true;

  if (auto && locality?.pelny_rejon != null) {
    showResult(locality.pelny_rejon, undefined, true, city, null);
    setStatus(`Cała miejscowość - Rejon ${locality.pelny_rejon}. Możesz też wybrać ulicę, aby potwierdzić.`);
  } else {
    hideResult();
    setStatus(streetOptions.length ? 'Wybierz ulicę.' : 'Brak ulic dla tej miejscowości.');
  }
}

function onCitySelect(value: string | null): void {
  if (!value) {
    cityValue = null;
    streetCombo.setItems([]);
    streetCombo.setDisabled(true);
    hideResult();
    return;
  }
  selectCity(value);
}

function onStreetSelect(value: string | null): void {
  if (value == null) return;
  const entry = streetOptions[Number(value)];
  if (!entry) return;
  streetName = entry.ulica;
  const variants = streetOptions.filter((s) => s.ulica === entry.ulica);
  if (variants.length > 1) {
    el.numerField.hidden = false;
    el.numer.placeholder = variants.some((s) => s.parzystosc) ? 'np. 12 (istotna parzystość)' : 'np. 12';
  } else {
    el.numerField.hidden = true;
    el.numer.value = '';
  }
  applyResolution();
}

function applyResolution(): void {
  if (!loaded || !cityValue) return;
  const numer = el.numer.value.trim() ? Number(el.numer.value) : null;
  const res = resolveAddress(loaded.streets, cityValue, streetName, numer);
  if (!res) {
    hideResult();
    setStatus('Nie znaleziono takiego adresu na liście.');
    return;
  }
  if (res.kind === 'ambiguous') {
    showAmbiguity(res.candidates);
    return;
  }
  el.ambiguity.hidden = true;
  showResult(res.rejon, res.entry, res.viaLocality, cityValue, streetName);
}

function showAmbiguity(candidates: StreetEntry[]): void {
  hideResult();
  el.ambiguity.hidden = false;
  el.ambiguity.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = 'Ta ulica jest podzielona między rejony. Wybierz właściwy zakres lub podaj numer domu:';
  el.ambiguity.append(p);
  const box = document.createElement('div');
  box.className = 'ambiguity__options';
  for (const c of candidates) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = `Rejon ${c.rejon} - ${describeEntry(c)}`;
    b.addEventListener('click', () => {
      el.ambiguity.hidden = true;
      if (cityValue) showResult(c.rejon, c, false, cityValue, streetName);
    });
    box.append(b);
  }
  el.ambiguity.append(box);
  setStatus('Ulica podzielona między rejony - doprecyzuj numer domu.');
}

function showResult(rejon: number, entry: StreetEntry | undefined, viaLocality: boolean, city: string, street: string | null): void {
  if (!loaded) return;
  const region = regionByNumber(loaded.regions, rejon);
  if (!region) return;
  currentRegion = region;

  if (!fractionsInitialised) {
    enabled = new Set(loaded.regions.fractions.map((f) => f.id));
    fractionsInitialised = true;
  }

  el.regionTitle.textContent = `Rejon ${rejon}`;
  el.regionMeta.textContent = region.lokalizacje;
  el.regionBadge.textContent = region.typ || 'harmonogram';
  el.calendarNote.hidden = true;

  renderFractionChips(region);
  renderSubscribe(region);
  renderSchedule(region);
  el.result.hidden = false;
  updateCalendar(region);
  updateUrl();
  const where = city ? `${street ? `${city}, ul. ${street}` : city} - ` : '';
  const qualifier = entry && describeEntry(entry) !== 'cała ulica' ? ` (${describeEntry(entry)})` : '';
  setStatus(
    viaLocality
      ? `${where}cała miejscowość obsługiwana w Rejonie ${rejon}.`
      : `${where}znaleziono adres w Rejonie ${rejon}${qualifier}.`,
  );
}

function renderFractionChips(region: RegionData): void {
  el.fractions.innerHTML = '';
  for (const f of loaded!.regions.fractions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (enabled.has(f.id) ? ' is-on' : '');
    btn.setAttribute('aria-pressed', String(enabled.has(f.id)));
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = f.color;
    const label = document.createElement('span');
    label.textContent = SHORT_FRACTION[f.id] ?? f.label;
    btn.append(dot, label);
    if (!region.schedule[f.id]?.some((m) => m.length) && f.id !== 'mycie_pojemnikow') {
      btn.classList.add('is-empty');
      btn.disabled = true;
    }
    btn.addEventListener('click', () => {
      if (enabled.has(f.id)) enabled.delete(f.id);
      else enabled.add(f.id);
      btn.classList.toggle('is-on', enabled.has(f.id));
      btn.setAttribute('aria-pressed', String(enabled.has(f.id)));
      updateCalendar(region);
      renderSchedule(region);
    });
    el.fractions.append(btn);
  }
}

function renderSchedule(region: RegionData): void {
  const fractions = loaded!.regions.fractions;
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  const h0 = document.createElement('th');
  h0.textContent = 'Miesiąc';
  hrow.append(h0);
  for (const f of fractions) {
    const th = document.createElement('th');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = f.color;
    th.append(dot, document.createTextNode(f.label));
    hrow.append(th);
  }
  thead.append(hrow);

  const tbody = document.createElement('tbody');
  MONTHS.forEach((month, m) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = month;
    tr.append(th);
    for (const f of fractions) {
      const td = document.createElement('td');
      if (!enabled.has(f.id)) td.className = 'cell-off';
      if (f.id === 'mycie_pojemnikow') {
        td.textContent = region.mycieMiesiace.includes(m) ? '✓' : '';
      } else {
        td.textContent = region.schedule[f.id][m].join(', ');
      }
      tr.append(td);
    }
    tbody.append(tr);
  });

  el.scheduleTable.innerHTML = '';
  el.scheduleTable.append(thead, tbody);
}

function renderSubscribe(region: RegionData): void {
  const entry = loaded!.entry;
  const url = icsUrl(entry, region.rejon);
  const name = `Odpady Czerwonak - Rejon ${region.rejon} (${entry.rok})`;

  el.icsLink.href = url;
  el.icsLink.textContent = url;
  el.btnGoogle.href = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`;
  el.btnWebcal.href = url.replace(/^https?:/, 'webcal:');
  el.btnDownload.onclick = () => {
    if (!currentRegion) return;
    const events = buildWasteEvents(currentRegion, entry.rok, loaded!.regions.fractions, enabled);
    const content = wasteEventsToIcs({ name, description: `Rejon ${region.rejon}, Gmina Czerwonak`, events });
    downloadText(`odpady-czerwonak-${entry.rok}-rejon-${region.rejon}.ics`, content);
  };
  el.btnCopy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Skopiowano link subskrypcji do schowka.');
    } catch {
      setStatus('Nie udało się skopiować - skopiuj link ręcznie.');
    }
  };

  el.fractionFeeds.innerHTML = '';
  for (const f of loaded!.regions.fractions) {
    if (!region.schedule[f.id]?.some((m) => m.length)) continue;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = icsUrl(entry, region.rejon, f.id);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = f.label;
    li.append(a);
    el.fractionFeeds.append(li);
  }
}

function updateCalendar(region: RegionData): void {
  if (!calendar) calendar = createCalendar(el.calendarHost);
  const events = buildWasteEvents(region, loaded!.entry.rok, loaded!.regions.fractions, enabled);
  calendar.removeAllEvents();
  calendar.addEventSource(toEventInputs(events));

  if (region.mycieMiesiace.length) {
    el.calendarNote.hidden = false;
    el.calendarNote.textContent = `Mycie pojemników: ${region.mycieMiesiace
      .map((m) => MONTHS[m])
      .join(', ')} - dokładny termin ustala wykonawca, zgodnie z regulaminem.`;
  } else {
    el.calendarNote.hidden = true;
  }
}

function updateUrl(): void {
  const params = new URLSearchParams();
  params.set('rok', el.year.value);
  if (cityValue) params.set('miasto', cityValue);
  if (streetName) params.set('ulica', streetName);
  if (el.numer.value.trim()) params.set('numer', el.numer.value.trim());
  if (currentRegion) params.set('rejon', String(currentRegion.rejon));
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
}

async function setupYear(rok: number): Promise<void> {
  loaded = await loadYear(rok);
  fractionsInitialised = false;
  enabled = new Set();
  cityCombo.setItems(
    loaded.streets.localities.map((l) => ({
      value: l.miasto,
      label: l.miasto,
      hint: l.pelny_rejon != null ? `Rejon ${l.pelny_rejon}` : 'wybierz ulicę',
    })),
  );
  streetCombo.setItems([]);
  streetCombo.setDisabled(true);
  el.numerField.hidden = true;
  el.numer.value = '';
  cityValue = null;
  streetName = null;
  hideResult();
  setStatus('Wybierz miejscowość.');
}

function restoreFromUrl(): void {
  const params = new URLSearchParams(location.search);
  const rok = Number(params.get('rok'));
  if (rok && rok !== Number(el.year.value) && years.some((y) => y.rok === rok)) {
    el.year.value = String(rok);
    void setupYear(rok).then(() => restoreCity(params));
    return;
  }
  restoreCity(params);
}

function restoreCity(params: URLSearchParams): void {
  const city = params.get('miasto');
  if (!city || !loaded?.streets.localities.some((l) => l.miasto === city)) return;
  selectCity(city, false);
  const street = params.get('ulica');
  if (street) {
    const idx = streetOptions.findIndex((s) => s.ulica === street);
    if (idx >= 0) {
      streetCombo.setValue(String(idx));
      onStreetSelect(String(idx));
      const numer = params.get('numer');
      if (numer) {
        el.numer.value = numer;
        applyResolution();
      }
    }
  } else if (loaded.streets.localities.find((l) => l.miasto === city)?.pelny_rejon != null) {
    selectCity(city, true);
  }
}

async function init(): Promise<void> {
  try {
    const idx = await loadIndex();
    years = idx.years;
    el.year.innerHTML = '';
    for (const y of [...years].sort((a, b) => b.rok - a.rok)) {
      const opt = document.createElement('option');
      opt.value = String(y.rok);
      opt.textContent = String(y.rok);
      el.year.append(opt);
    }
    el.year.value = String(years[years.length - 1].rok);
    await setupYear(Number(el.year.value));
    restoreFromUrl();
  } catch (e) {
    setStatus(`Błąd wczytywania danych: ${(e as Error).message}`);
  }
}

el.year.addEventListener('change', () => {
  void setupYear(Number(el.year.value)).then(() => {
    updateUrl();
  });
});
el.numer.addEventListener('input', () => applyResolution());

void init();
