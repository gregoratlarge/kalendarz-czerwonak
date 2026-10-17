# Kalendarz wywozu odpadów - Gmina Czerwonak

Statyczna strona (GitHub Pages) dla mieszkańców gminy Czerwonak: wyszukaj
miejscowość i ulicę, zobacz kalendarz odbioru odpadów i **subskrybuj** go
w swoim kalendarzu (Google / Apple / Outlook) albo pobierz plik `.ics`.

- Strona: <https://gregoratlarge.github.io/kalendarz-czerwonak/>
- Dane źródłowe: harmonogramy PDF (nowe rejony) z [czerwonak.pl](https://www.czerwonak.pl/pl/mieszkaniec/informacje/aktualnosci/nowe-harmonogramy-odbioru-odpadow-komunalnych-z-nieruchomosci-znajdujacych-sie-na-terenie-gminy-czerwonak/10734)

> **Aktualny zakres danych:** październik - grudzień 2026, według nowego podziału
> na rejony (1, 2A, 2B, 3, 4, 5, 6A, 6B, 7, 8, 9, 10). Poprzedni harmonogram
> (styczeń - wrzesień 2026, stary podział na 13 rejonów) jest zachowany tylko
> jako archiwum w `source_data/archiwum/` i nie trafia na stronę.
>
> Szczegóły tej zmiany (analiza podziału na rejony, decyzje, weryfikacja):
> [`docs/2026Q4-remodel.md`](docs/2026Q4-remodel.md).

## Jak to działa

1. **Pipeline** (`pipeline/`) parsuje pliki `rejon*.pdf` z katalogu
   `source_data/<okres>/` (np. `2026Q4`) i generuje:
   - `public/data/index.json` - lista dostępnych lat,
   - `public/data/<rok>/regions.json` - harmonogramy rejonów (12 miesięcy × 8 frakcji;
     wypełnione tylko miesiące objęte dokumentem),
   - `public/data/<rok>/streets.json` - indeks miejscowości i ulic,
   - `public/ics/<rok>/rejon-<id>.ics` - feed do subskrypcji dla całego rejonu,
   - `public/ics/<rok>/rejon-<id>-<frakcja>.ics` - feedy pojedynczych frakcji.

   Lista ulic jest budowana **wprost z nagłówków PDF-ów** (każdy rejon wylicza
   obsługiwane miejscowości i ulice), więc nie ma już osobnego arkusza do
   parsowania ani tabeli korekt.
2. **Aplikacja** (`src/`) to Vite + TypeScript (bez frameworka). Ładuje dane z
   `public/data`, prezentuje kalendarz (FullCalendar, widok miesiąca i listy) oraz
   obsługuje subskrypcję/pobieranie `.ics`.

Wszystkie zdarzenia są **całodniowe**, a tytuł to `Odpady: ` + nazwa frakcji z
dokumentu źródłowego (np. `Odpady: Metale i tworzywa sztuczne`).

Identyfikator rejonu (`rejon`) odpowiada nazwie pliku (`2a`, `6b`), bo służy też
jako fragment adresu `.ics`; do wyświetlania używana jest forma z `lib/regions.ts`
(`2a` → `2A`).

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

## Dodanie kolejnego okresu

1. Utwórz katalog `source_data/<okres>/`, np. `2027` lub `2027Q1`, i wgraj pliki
   `rejon*.pdf` (zestaw i nazwy rejonów mogą się zmieniać - parser odkrywa je
   automatycznie, a identyfikatorem rejonu jest część nazwy po `rejon`).
2. Uruchom `npm run data` - rok pojawi się automatycznie w
   `public/data/index.json` i w selektorze roku na stronie.

Katalogi w `source_data/`, których nazwa nie zaczyna się od czterech cyfr (np.
`archiwum`), są ignorowane.

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
  lib/regions.ts         # etykieta rejonu do wyświetlania (2a → 2A)
pipeline/
  run.ts                 # orkiestracja: okres → regions.json / streets.json / .ics
  pdf.ts                 # parser PDF (pdfjs-dist): harmonogram + nagłówek
  streets.ts             # budowa indeksu ulic z nagłówków PDF
  constants.ts           # frakcje, miesiące, granice kolumn, miejscowości
  generate-ics.ts        # składanie plików .ics
tests/                   # vitest: parser danych, resolver, ICS, smoke test DOM
docs/                    # notatki projektowe (decyzje, weryfikacja)
```

## Uwagi o danych źródłowych

- **Kicin, ul. Poznańska** jest dzielona na rejony 1/2A według parzystości numerów;
  **Czerwonak, ul. Źródlana** na rejony 8/9 (do 72 / od 74), a **Czerwonak,
  ul. Błękitna** ma numer 10 w rejonie 7, a pozostałe numery w rejonie 9.
  Aplikacja prosi wtedy o numer domu.
- Miejscowości obsługiwane w całości przez jeden rejon (np. Owińska, Koziegłowy,
  Ludwikowo, Szlachęcin) można wybrać bez podawania ulicy.
- „Mycie pojemników” jest w źródle oznaczone tylko miesiącem (✓), bez dnia.
  W aplikacji pokazujemy miesiąc i informację, że termin ustala wykonawca;
  zdarzenie nie trafia do pliku `.ics`, bo nie ma konkretnej daty. W okresie
  październik - grudzień 2026 źródło nie podaje żadnego terminu mycia.
- „Bioodpady - drzewka świąteczne” to zbiórka styczniowa; w tym okresie nie ma
  żadnych terminów, więc frakcja nie generuje plików `.ics`.

## Analityka

Strona wysyła zanonimizowane statystyki odwiedzin do **Google Analytics 4**
(tag `G-DT0L3T6ZHD`). Snippet gtag.js jest wklejony w `<head>` pliku
`index.html` i trafia do builda produkcyjnego bez dodatkowej konfiguracji.

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
