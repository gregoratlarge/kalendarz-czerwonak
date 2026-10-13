#!/usr/bin/env python3
"""Parse the Czerwonak 2026 waste-collection PDF calendars into JSON.

Each PDF is a single landscape A4 page with one table. The logical columns
(by x-center in PDF points) are:
  month(~74) mixed(~153) paper(~236) metal(~320) glass(~404)
  bio(~489) trees(~576) bulky(~660) washing(~754)
"""
import fitz
import json
import re

COLS = [
    ("miesiac", 74),
    ("zmieszane", 153),
    ("papier", 236),
    ("metale_i_tworzywa", 320),
    ("szklo", 404),
    ("bioodpady", 489),
    ("bioodpady_drzewka_swiateczne", 576),
    ("odpady_wystawkowe", 660),
    ("mycie_pojemnikow", 754),
]

MONTHS = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
          "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"]


def nearest_col(x):
    return min(COLS, key=lambda c: abs(c[1] - x))[0]


def parse(path):
    doc = fitz.open(path)
    page = doc[0]
    words = page.get_text("words")  # x0,y0,x1,y1,text,block,line,wordno

    # --- header / location block (text above the table) ---
    # the table starts at the "Miesiąc"/"Styczeń" row; anchor header above it
    sty_y = min(w[1] for w in words if w[4] == "Styczeń")
    header_words = [w for w in words if w[1] < sty_y - 3]
    header = " ".join(w[4] for w in header_words)
    header = re.sub(r"\s+", " ", header).strip()

    m = re.search(r"Rejon\s+(\d+)", header)
    rejon = int(m.group(1)) if m else None
    m = re.search(r"nieruchomości[:]?\s*(.*?)\s*Rejon", header)
    typ = m.group(1).strip() if m else None

    # locations: between "rok" and "EKO"
    m = re.search(r"\brok\b\s*(.*?)\s*EKO", header)
    locations = m.group(1).strip() if m else ""

    # --- table data rows: anchor each word to the nearest month row ---
    month_y = {}
    for w in words:
        if w[4] in MONTHS:
            month_y.setdefault(w[4], w[1])
    anchor_y = sorted(month_y.values())
    top = min(anchor_y) - 4
    bot = max(anchor_y) + 6

    rows = {}  # month -> list of words
    for w in words:
        if not (top <= w[1] <= bot):
            continue
        if w[4] in MONTHS:
            rows.setdefault(w[4], []).append(w)
            continue
        # nearest month anchor
        month = min(month_y, key=lambda mo: abs(month_y[mo] - w[1]))
        if abs(month_y[month] - w[1]) <= 9:
            rows.setdefault(month, []).append(w)

    months_seen = {}
    for month, ws in rows.items():
        cells = {}
        for w in ws:
            col = nearest_col(w[0])
            if col == "miesiac":
                continue
            cells.setdefault(col, []).append((w[0], w[4]))
        entry = {}
        for col, _ in COLS:
            if col == "miesiac":
                continue
            parts = [t for _, t in sorted(cells.get(col, []))]
            val = " ".join(parts).strip()
            val = val.replace(" ", "") if col != "mycie_pojemnikow" else val
            entry[col] = val
        months_seen[month] = entry

    ordered = {mo: months_seen.get(mo, {k: "" for k, _ in COLS if k != "miesiac"})
               for mo in MONTHS}

    return {
        "file": path.split("/")[-1],
        "rejon": rejon,
        "typ_zabudowy": typ,
        "lokalizacje": locations,
        "numer_kontaktowy": "607 414 414" if "607 414 414" in header else None,
        "miesiace": ordered,
    }


if __name__ == "__main__":
    out = []
    for r in range(1, 14):
        out.append(parse(f"rejon{r}.pdf"))
    with open("harmonogram_2026.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("wrote harmonogram_2026.json")
    for rec in out:
        print(f"Rejon {rec['rejon']:>2} | {rec['typ_zabudowy']} | {rec['lokalizacje'][:70]}")
