# Kalendarz wywozu odpadów - Gmina Czerwonak

Statyczna strona (GitHub Pages) dla mieszkańców gminy Czerwonak: wyszukaj
miejscowość i ulicę, zobacz kalendarz odbioru odpadów i **subskrybuj** go
w swoim kalendarzu (Google / Apple / Outlook) albo pobierz plik `.ics`.

- Strona: <https://gregoratlarge.github.io/kalendarz-czerwonak/>
- Dane źródłowe: harmonogramy PDF + arkusz „Opis rejonów” z [czerwonak.pl](https://czerwonak.pl/pl/mieszkaniec/informacje/aktualnosci/harmonogram-wywozu-odpadow-na-rok-2026/9588)

## Jak to działa

1. **Pipeline** (`pipeline/`) parsuje 13 plików `rejon*.pdf` oraz
   `rejonyczerwonak.xlsx` i generuje:
   - `public/data/index.json` - lista dostępnych lat,
   - `public/data/<rok>/regions.json` - harmonogramy 13 rejonów (12 miesięcy × 8 frakcji),
   - `public/data/<rok>/streets.json` - indeks miejscowości i ulic,
   - `public/ics/<rok>/rejon-<n>.ics` - feed do subskrypcji dla całego rejonu,
   - `public/ics/<rok>/rejon-<n>-<frakcja>.ics` - feedy pojedynczych frakcji.
2. **Aplikacja** (`src/`) to Vite + TypeScript (bez frameworka). Ładuje dane z
   `public/data`, prezentuje kalendarz (FullCalendar, widok miesiąca i listy) oraz
   obsługuje subskrypcję/pobieranie `.ics`.

Wszystkie zdarzenia są **całodniowe**, a tytuł to `Odpady: ` + nazwa frakcji z
dokumentu źródłowego (np. `Odpady: Metale i tworzywa sztuczne`).

## Uruchomienie lokalne

Wymagania: Node.js 20+.

```bash
npm install
npm run dev      # generuje dane i uruchamia serwer deweloperski
```

Pozostałe skrypty:

```bash
npm run data       # tylko wygenerowanie danych i plików .ics
npm run typecheck  # kontrola typów (tsc --noEmit)
npm test           # testy (vitest)
npm run build      # dane + build produkcyjny do dist/
npm run preview    # podgląd builda
```

## Dodanie kolejnego roku

1. Utwórz katalog `source_data/<rok>/` i wgraj `rejon1.pdf`…`rejon13.pdf`
   oraz `rejonyczerwonak.xlsx`.
2. Uruchom `npm run data` - nowy rok pojawi się automatycznie w
   `public/data/index.json` i w selektorze roku na stronie.

## Struktura repo

```
index.html               # szkielet strony (polski UI)
src/
  main.ts                # logika aplikacji (rok → miejscowość → ulica → rejon)
  combobox.ts            # wyszukiwalny dropdown z dopasowaniem rozmytym (Fuse)
  calendar.ts            # konfiguracja FullCalendar
  resolve.ts             # przypisanie adresu do rejonu (parzystość / zakresy numerów)
  data.ts                # ładowanie danych i budowanie URL-i .ics
  lib/ics.ts             # generator iCalendar (RFC 5545), wspólny z pipeline
  lib/events.ts          # rozwijanie harmonogramu do zdarzeń całodniowych
pipeline/
  run.ts                 # orkiestracja: rok → regions.json / streets.json / .ics
  pdf.ts                 # parser PDF (pdfjs-dist)
  xlsx.ts                # parser arkusza ulic (SheetJS)
  constants.ts           # frakcje, miesiące, granice kolumn
  overrides.ts           # udokumentowane korekty danych źródłowych
tests/                   # vitest: parser danych, resolver, ICS, smoke test DOM
```

## Uwagi o danych źródłowych

- **Kicin, ul. Poznańska** jest dzielona na rejony 1/2 według parzystości numerów;
  **Czerwonak, ul. Źródlana** na rejony 8/9 według numeru (do 73 / od 74).
  Aplikacja prosi wtedy o numer domu.
- „Mycie pojemników” jest w źródle oznaczone tylko miesiącem (✓), bez dnia.
  W aplikacji pokazujemy miesiąc i informację, że termin ustala wykonawca;
  zdarzenie nie trafia do pliku `.ics`, bo nie ma konkretnej daty.
- `pipeline/overrides.ts` zawiera kilka potwierdzonych nieścisłości arkusza
  (np. brak `Malinowa` w rejonie 7, warianty pisowni `Hassego`, `Słowackiego`).

## Wdrożenie

Workflow `.github/workflows/deploy.yml` buduje projekt i publikuje `dist/` na
GitHub Pages. W ustawieniach repozytorium ustaw **Settings → Pages → Source:
GitHub Actions**.

### Uwaga o typie MIME dla `.ics`

GitHub Pages potrafi serwować pliki `.ics` jako `application/octet-stream`,
co niektóre aplikacje kalendarza odrzucają. Jeśli napotkasz ten problem,
subskrybuj feed przez **jsDelivr**, który zawsze zwraca `text/calendar`:

```
https://cdn.jsdelivr.net/gh/gregoratlarge/kalendarz-czerwonak@main/public/ics/2026/rejon-1.ics
```

Linki „Apple / Outlook (webcal)” oraz pobieranie pliku działają niezależnie od
typu MIME.
