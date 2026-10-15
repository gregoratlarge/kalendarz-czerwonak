# Remodel: Oct-Dec 2026 schedule and the new region scheme

Engineering notes for the change that replaced the January-September 2026 data
with the municipality's new harmonogramy (October-December 2026) and its new
region split. Written to record *why* the code looks the way it does, what was
verified, and what was consciously left alone.

Commit: `bf9a410` (see `git show bf9a410`). Supersedes the full-year 2026 data in
`8d2c510`.

## 1. Why

The gmina published a new set of harmonogramy. They differ from the previous set
in two independent ways:

1. **Dates.** They cover only 01.10 - 31.12.2026, not a full year.
2. **Regions.** The division changed: 13 numeric regions became 12 regions, two
   of which are lettered pairs (`2A`/`2B`, `6A`/`6B`) with genuinely different
   pickup dates.

Decision (explicitly confirmed): do **not** map old regions onto new ones and do
**not** keep the previous months. The calendar serves exactly what the new
documents say, for exactly the months they cover, so the site always matches the
PDF a resident can download. The old set is archived rather than deleted, purely
for provenance.

## 2. Sources

- `source_data/2026Q4/` - 12 PDFs (`rejon1.pdf`, `rejon2a.pdf`, `rejon2b.pdf`,
  `rejon3.pdf` ... `rejon10.pdf`) plus `rejonyjednorodzinnepodzial.docx`.
- `source_data/archiwum/2026/` - the retired full-year set (13 PDFs, the old
  `rejonyczerwonak.xlsx`, `harmonogram_2026.json`, `parse_pdfs.py`).
- `source_data/archiwum/` is ignored by the pipeline because discovery only
  accepts directory names that start with four digits (see §5).

The `.docx` is committed **for provenance only and is not parsed**. It is the
official division description and was used manually to cross-check the new
scheme, but the PDFs remain the single source of truth so nothing can silently
override them at build time. `.gitattributes` marks `*.docx binary`.

Shape of the new PDFs (differs from the old ones):

- 1 page, landscape.
- Header line `HARMONOGRAM NR <n> - 01.10 - 31.12.2026` (the `HARMONOGRAM NR`
  replaces the old `Rejon N` line as the region marker).
- Only Październik / Listopad / Grudzień rows.
- Same 8 fraction columns as before, so `COL_BOUNDS` is unchanged.
- The address block ends with the contractor phone `607 414 414`, which has to be
  stripped before the text is shown as `lokalizacje`.
- Scope is single-family housing.

## 3. The new region scheme (as parsed)

| id | shown | localities (parsed)                   | streets | dates |
|----|-------|---------------------------------------|---------|-------|
| 1  | 1     | Kicin (odd Poznańska), Mielno, Ludwikowo | 40   | 35    |
| 2a | 2A    | Kicin (even Poznańska)                | 21      | 36    |
| 2b | 2B    | Dębogóra, Kliny                       | 28      | 37    |
| 3  | 3     | Annowo, Owińska                       | 20      | 33    |
| 4  | 4     | Bolechówko, Potasze, Trzaskowo        | 52      | 34    |
| 5  | 5     | Bolechowo, Bolechowo-Osiedle          | 36      | 33    |
| 6a | 6A    | Miękowo                               | 25      | 35    |
| 6b | 6B    | Promnice, Szlachęcin                  | 18      | 34    |
| 7  | 7     | Czerwonak (part: Błękitna nr 10, ...) | 17      | 34    |
| 8  | 8     | Czerwonak (part: Dolna, Źródlana do 72, ...) | 26 | 37 |
| 9  | 9     | Czerwonak (part: Źródlana od 74, Błękitna bez 10, ...) | 32 | 35 |
| 10 | 10    | Koziegłowy                            | 17      | 36    |

Totals: 332 streets, 17 localities, 3 months (indices `[9, 10, 11]`).

### Ids vs display

Region ids are **strings** (`"1"`, `"2a"`, `"2b"`, ...) because they double as URL
and file segments (`ics/2026/rejon-2a.ics`) and because `2a` and `2` are distinct
feeds. The display form (`2A`) is produced on demand by `src/lib/regions.ts`:

```ts
regionLabel('2a') // '2A'
```

That helper is shared by the pipeline (`.ics` calendar names) and the UI (region
heading, combobox hints, download filename), so `2a` is never shown to a user.

### Whole-locality places

A locality is "whole-locality" when it maps to exactly one region, so the app can
skip asking for a street. Encode that as `LocalityEntry.pelny_rejon` (or `null`
when the locality is split). Only **Czerwonak** and **Kicin** are `null`.

Two places have a `pelny_rejon` but **no per-street rows at all**: `Ludwikowo`
(1) and `Szlachęcin` (6b) - the PDFs name the village without enumerating
streets. Mielno is also a single-region locality but the PDF does enumerate its
12 streets, so it has both rows and a `pelny_rejon`; that is harmless.

### Split streets

Three streets need more than a street name to resolve:

| locality  | street    | rule                                   |
|-----------|-----------|----------------------------------------|
| Kicin     | Poznańska | odd -> 1, even -> 2a (`parzystosc`)    |
| Czerwonak | Źródlana  | `nr do 72` -> 8, `nr od 74` -> 9       |
| Czerwonak | Błękitna  | `nr 10` -> 7, everything else -> 9     |

`Błękitna` is the interesting one: the source says `Błękitna (nr 10)` in region 7
and `Błękitna (z wyjątkiem nr 10)` in region 9. A "z wyjątkiem" qualifier is
encoded as **two numeric ranges** rather than an "except" flag
(`nr_do: 9`, `nr_od: 11`), so resolution stays a simple ordered comparison with
no dependence on array order:

- `Błękitna 10` -> 7
- `Błękitna 5`  -> 9
- `Błękitna 15` -> 9

No catch-all entry is needed.

Similarly, `(nr X)` becomes `nr_od === nr_do === X`, which the UI renders as
`numer X` (not `numery X-X`).

### What disappeared vs the old set

332 streets now vs 338 before. The six removed are genuinely absent from the new
PDF text (grepped the raw extraction; they are not parser misses):

- Czerwonak: `Portowa`, `Słoneczna`
- Koziegłowy: `Piaskowa`
- Owińska: `Kolejowa`, `Plażowa`, `Żwirownia`

`Kolejowa` still exists as a street, just in **Bolechowo-Osiedle** and
**Miękowo**; `Piaskowa` still exists in **Czerwonak**. `Koziegłowy Lipowa` is
kept as a whole street in region 10 (only the old "Lipowa nr 3" subdivision is
gone).

## 4. Data contract

`public/data/2026/regions.json`

- New: `miesiace: number[]` (here `[9, 10, 11]`) naming the months the document
  actually covers.
- `regions[].rejon` is now a **string**.
- `schedule` is still a sparse 12-slot month array per fraction. Months outside
  `miesiace` are empty arrays; the app renders only the covered months, so the
  table shows 3 rows instead of 12.

`public/data/2026/streets.json`

- `localities[].pelny_rejon: string | null`.
- `streets[].rejon: string`, plus optional `parzystosc`, `nr_od`, `nr_do`.

`public/data/index.json` is unchanged in shape (still one year entry pointing at
the same relative paths).

Of the 79 generated `.ics` files: 12 are whole-region feeds, and 67 are
per-fraction feeds. The breakdown is 5 fractions x 12 regions (`zmieszane`,
`papier`, `metale_i_tworzywa`, `szklo`, `bioodpady`) plus 7 `odpady_wystawkowe`
feeds (regions 1, 2b, 6a, 7, 8, 9, 10). No feed is written for a fraction a region
has no dates for, which is why:

- `drzewka_swiateczne` produces **no** files (January-only collection),
- `mycie_pojemnikow` produces **no** files (the source marks it by month only),
- `2a`/`6b` get no `odpady_wystawkowe` feed while `2b`/`6a` do.

## 5. Pipeline changes

`pipeline/run.ts`

- `discoverSources()` treats a `source_data/<name>` entry as a data set when
  `<name>` starts with four digits (`2026`, `2026Q4`, `2027Q1`, ...). Anything
  else (`archiwum`) is skipped. Two directories resolving to the same year throw,
  so an ambiguous tree fails loudly instead of silently picking one.
- Region files are any `rejon*.pdf`; the id is the text between `rejon` and
  `.pdf`, lowercased. Order is a natural sort so `2a`/`2b` land between `2` and
  `3` and `10` sorts after `9`.
- `miesiace` is the union of months where any region has a date.
- The year's `ics/` directory is deleted and rebuilt each run; stale top-level
  year directories under `public/data` and `public/ics` are pruned.

`pipeline/pdf.ts` (rewritten)

- Reads only the month rows present in the document; there is no assumption of
  twelve rows.
- Returns `ParsedRegion { region, block }`, where `block` is the raw header text
  (used by the street parser).
- Header extraction: lines between the `HARMONOGRAM NR` line and the
  `Daty odbioru` line. The contractor phone is stripped with
  `/\d{3}[\s-]?\d{3}[\s-]?\d{3}/`.

Two tolerances matter and are the subtle part of this change:

- `LINE_TOL = 3` - fragments whose baselines differ by less than this are on the
  same visual line.
- `ROW_TOL = 10` - how far a fragment may sit from a month label and still belong
  to that row. A cell that wraps to a second line sits ~7 units below the first
  (row spacing is ~15); footnotes start ~29 below the last row.

**The split-glyph bug.** A cell's day number can arrive as two separate text
fragments. Rejon 7's October `odpady_wystawkowe` is the string `1` and then `7`
about sixty units to the right; read per-fragment it becomes two days (1 and 7)
instead of one (17). Rejon 8's October `odpady_wystawkowe` (21) has the same
shape. The fix is to group fragments by `(column, month row)` and concatenate
them **in reading order before extracting digits**, rather than extracting digits
per fragment. `tests/data.test.ts` pins both cases.

`pipeline/streets.ts` (new) - see §6.

`pipeline/xlsx.ts` and `pipeline/overrides.ts` (deleted), and the `xlsx`
dependency removed from `package.json`/lock. The old workflow needed an XLSX
"Opis rejonów" sheet for the street list plus a hand-maintained corrections table
(`Malinowa` was missing from the sheet; `Hassego` vs `Haasego`). The new PDFs
enumerate their own street lists, so both crutches are gone. Dropping `xlsx` also
removes a package with a history of prototype-pollution advisories.

## 6. Street index rules (`pipeline/streets.ts`)

Header text looks like `<Locality>: <street> (<qualifier>), <street>, ...` and
may list several localities. Rules:

- Locality names are matched with a regex built from `LOCALITIES`, longest name
  first, accepting an ASCII-folded key (so `Bolechowo - Osiedle` and
  `Bolechowo-Osiedle` both map to the canonical `Bolechowo-Osiedle`).
- Qualifications, in the forms the sources actually use:
  - `(parzyste)` / `(nieparzyste)` -> `parzystosc`.
  - `(nr od N)` -> `nr_od`; `(nr do N)` -> `nr_do`.
  - `(nr N)` -> `nr_od = nr_do = N`.
  - `(z wyjątkiem nr N)` -> two ranges (`nr_do = N-1`, `nr_od = N+1`).
- A locality that appears under exactly one region overall gets
  `pelny_rejon = <that region>`; otherwise `null`.
- `warnings` are collected for anything unparsable and printed by `run.ts`.

**Street names are kept exactly as the PDF spells them.** Notably the new PDFs
write `Zielony` (Czerwonak) and `Przemysława` (Owińska) where both the official
division `.docx` and the previous site wrote `Plac Zielony` and `Pl. Przemysława`.
This is a deliberate choice (confirmed): stay literal to the scheduling document
rather than reintroduce per-street overrides. The other old/new name differences
are corrections and were adopted: `Ks. Ludwika Hassego` -> `Ks. Ludwika Haasego`,
`Ks.antoniego Piotrowskiego` -> `Ks. Antoniego Piotrowskiego`.

## 7. App changes

- `src/lib/regions.ts` (new): `regionLabel()`.
- `src/lib/types.ts`: `rejon: string`, `RegionsFile.miesiace`,
  `LocalityEntry.pelny_rejon: string | null`.
- `src/data.ts`: `regionByNumber` -> `regionById`; `icsUrl(entry, rejon: string)`.
- `src/resolve.ts`: `Resolved.rejon: string`; `describeEntry` renders a single
  number as `numer X`.
- `src/main.ts`: renders only the covered months (`miesiace`), uses `regionLabel`
  everywhere a region is shown (heading, combobox hint, subscribe name, download
  filename), and points `SOURCE_URL` at the new announcement.
- `index.html`: the schedule heading is `<h3 id="schedule-heading">Harmonogram</h3>`
  (was "Pełny harmonogram", no longer accurate for a 3-month document); the
  footer links to the new announcement.

## 8. Verification

- `npm run typecheck` clean; `npm test` 67/67; `npm run build` succeeds.
- **Cell-for-cell comparison**: an independent script re-extracts every PDF and
  compares each `(region, month, fraction)` cell against `regions.json`, using a
  *looser* row band (12 vs the parser's 10) so a wrapped line cannot be silently
  dropped. All 12 PDFs x 3 months x 8 columns match exactly.
- The six dropped streets were confirmed absent from the raw PDF text.
- The `.docx` street names were diffed against the parsed names; after accounting
  for the "(wszystkie ulice)" entries (the docx does not enumerate most
  localities) the only genuine difference is the `Zielony` / `Plac Zielony` case
  in §6.
- Live check after deploy: `regions.json` has `miesiace: [9,10,11]` and 12 new
  ids; `rejon-2a.ics` has `X-WR-CALNAME:Odpady Czerwonak - Rejon 2A (2026)`;
  `streets.json` has 332/17; a retired feed (`rejon-11.ics`) 404s.

Useful gotcha when re-verifying: a first draft of the independent checker joined
fragments **across** columns, producing nonsense like `2014` from a `20` and a
`14` in adjacent columns. Group by column first; the parser does.

## 9. Adding the next period

Drop a new directory `source_data/2027Q1/` (or `2027/`) containing `rejon*.pdf`.
The set and names of regions may change freely - discovery and id extraction are
generic - and the year appears in `public/data/index.json` automatically. Region
ids must stay lowercase and URL-safe, since they are file names.

## 10. Constraints to keep in mind

- Polish UI only; avoid en dashes and em dashes, use the ASCII hyphen.
- All events are all-day; the title is `Odpady: ` + the source's own wording.
- Parity values in JSON are exactly `parzyste` and `nieparzyste`.
- No new runtime dependencies, and no new npm dependency unless it earns its
  place (this change removed one instead).
- The desktop-Chrome "Google Calendar" button must keep working. Google's
  `/render?cid=` deep link only works in a desktop browser; mobile users get the
  copy-the-URL route. Do not "fix" that by sending phones to the deep link.
- `.ics` calendar names use the display label (`Rejon 2A`), file names use the
  raw id (`rejon-2a.ics`).
- `Warning: TT: undefined function: 21` printed by pdfjs once per PDF on every
  build is harmless noise.
