"""Export the MSB sample workbook (any number of customers x 365 days) into committed dataset files.

Usage:
    python apps/agent/tools/export_msb_dataset.py "~/Downloads/Data_mau_365ngay_40KH.xlsx"

Only the Python standard library is used (the workbook is parsed as OOXML) so the
script runs in any environment without openpyxl or pandas. Output goes to
apps/api/src/database/msb-dataset/ and is consumed by the API seed and the Jest
golden test for the metric formulas. All identities in the workbook are synthetic.

The customer sheets are read from their first data row down to the last consecutive row
whose column A is an 8-digit CIF, so adding customers to the workbook needs no code
change (the "Product Holding" totals row is ignored). The as-of date is the last day of
the journal, never the wall clock.
"""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = REPO_ROOT / "apps" / "api" / "src" / "database" / "msb-dataset"

SHEET_CUSTOMERS = "Danh sách KH & Phân hạng"
SHEET_HOLDINGS = "Product Holding"
SHEET_JOURNAL = "Nhật ký 365 ngày"
SHEET_NBO = "Next Best Offer"
SHEET_METRICS = "Chỉ số đánh giá KH"

HOLDING_CODES = [
    "ACCOUNT", "CASA", "FD", "LOAN_ADVANCE", "BOND", "CREDIT_CARD", "LOAN_OVERDRAFT",
    "LOAN_UNSECURED", "LOAN_MORTGAGE", "FX", "BANCA_LIFE", "BANCA_NONLIFE", "FUND_CERT",
]
NBO_CODES = ["CREDIT_CARD", "BANCA", "FX", "BOND", "LOAN"]

# Journal columns (Excel letter -> dataset column).
JOURNAL_COLUMNS = [
    ("A", "cif", "str"),
    ("C", "position_date", "date"),
    ("D", "month_key", "int"),
    ("AG", "day_index", "int"),
    ("E", "account_balance", "int"),
    ("F", "casa_balance", "int"),
    ("G", "fd_balance", "int"),
    ("H", "bond_balance", "int"),
    ("I", "fund_cert_value", "int"),
    ("J", "loan_advance", "int"),
    ("K", "loan_overdraft", "int"),
    ("L", "loan_unsecured", "int"),
    ("M", "loan_mortgage", "int"),
    ("N", "loan_total", "int"),
    ("O", "credit_card_balance", "int"),
    ("P", "credit_card_spend", "int"),
    ("Q", "fx_volume", "int"),
    ("R", "banca_life_premium", "int"),
    ("S", "banca_nonlife_premium", "int"),
    ("T", "mobile_topup", "int"),
    ("U", "bill_payment", "int"),
    ("V", "securities_net", "int"),
    ("W", "flight_ticket", "int"),
    ("X", "bus_ticket", "int"),
    ("Y", "vietlott", "int"),
    ("Z", "loan_repayment", "int"),
    ("AA", "genetica_fee", "int"),
    ("AB", "advisory_fee", "int"),
    ("AC", "western_union_fee", "int"),
    ("AD", "nice_account_fee", "int"),
    ("AE", "txn_count", "int"),
    ("AF", "is_active", "active"),
]

METRIC_COLUMNS = {
    "A": ("cif", "str"),
    "F": ("creditLimit", "float"),
    "G": ("recencyDays", "float"),
    "H": ("freq90", "float"),
    "I": ("freqPrev90", "float"),
    "J": ("casaAvg90", "float"),
    "K": ("casaAvgPrev90", "float"),
    "L": ("trend90", "float"),
    "M": ("casaCv90", "float"),
    "N": ("ccAvgBalance90", "float"),
    "O": ("cur", "float"),
    "P": ("loanTotal", "float"),
    "Q": ("fdCurrent", "float"),
    "R": ("bondCurrent", "float"),
    "S": ("fundCertCurrent", "float"),
    "T": ("tav", "float"),
    "U": ("leverage", "float"),
    "V": ("phs", "float"),
    "W": ("fxVolume12m", "float"),
    "X": ("rasRaw", "float"),
    "Y": ("valueScore", "float"),
    "Z": ("churnScore", "float"),
    "AA": ("churnLabel", "str"),
    "AB": ("crossSellScore", "float"),
    "AC": ("priorityScore", "float"),
    "AD": ("suggestionText", "str"),
}


class Workbook:
    def __init__(self, path: Path) -> None:
        self.zip = zipfile.ZipFile(path)
        self.shared: list[str] = []
        if "xl/sharedStrings.xml" in self.zip.namelist():
            root = ET.fromstring(self.zip.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                self.shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        workbook = ET.fromstring(self.zip.read("xl/workbook.xml"))
        rels = ET.fromstring(self.zip.read("xl/_rels/workbook.xml.rels"))
        targets = {rel.get("Id"): rel.get("Target") for rel in rels}
        self.sheets: dict[str, str] = {}
        for sheet in workbook.find("m:sheets", NS):
            target = targets[sheet.get(f"{{{NS['r']}}}id")]
            target = target.lstrip("/")
            if not target.startswith("xl/"):
                target = "xl/" + target
            self.sheets[sheet.get("name")] = target

    def rows(self, sheet_name: str) -> dict[int, dict[str, str | None]]:
        root = ET.fromstring(self.zip.read(self.sheets[sheet_name]))
        rows: dict[int, dict[str, str | None]] = {}
        for row in root.iter(f"{{{NS['m']}}}row"):
            cells: dict[str, str | None] = {}
            for cell in row.findall("m:c", NS):
                column = re.match(r"[A-Z]+", cell.get("r")).group()
                kind = cell.get("t")
                value = cell.find("m:v", NS)
                if kind == "s" and value is not None:
                    cells[column] = self.shared[int(value.text)]
                elif kind == "inlineStr":
                    cells[column] = "".join(t.text or "" for t in cell.iter(f"{{{NS['m']}}}t"))
                elif value is not None:
                    cells[column] = value.text
                else:
                    cells[column] = None
            rows[int(row.get("r"))] = cells
        return rows


def to_iso_date(value: str | None) -> str:
    day, month, year = str(value).strip().split("/")
    return f"{year}-{int(month):02d}-{int(day):02d}"


def to_int(value: str | None) -> int:
    return int(round(float(value))) if value not in (None, "") else 0


def to_float(value: str | None) -> float:
    return float(value) if value not in (None, "") else 0.0


CIF_PATTERN = re.compile(r"\d{8}")


def cif_rows(rows: dict[int, dict[str, str | None]], first_row: int) -> list[dict[str, str | None]]:
    """Consecutive rows from `first_row` whose column A is a CIF; stops at a totals or blank row."""
    selected = []
    index = first_row
    while index in rows and CIF_PATTERN.fullmatch(str(rows[index].get("A") or "").strip()):
        selected.append(rows[index])
        index += 1
    return selected


def export_customers(workbook: Workbook) -> list[dict]:
    rows = workbook.rows(SHEET_CUSTOMERS)
    customers = []
    for row in cif_rows(rows, 5):
        customers.append(
            {
                "cif": row["A"],
                "fullName": row["B"],
                "gender": "MALE" if str(row["C"]).strip().lower() == "nam" else "FEMALE",
                "dateOfBirth": to_iso_date(row["D"]),
                "phone": row["E"],
                "email": row["F"],
                "branch": row["G"],
                "cifOpenedAt": to_iso_date(row["H"]),
                "tier": row["I"],
                "declaredBehaviour": row["J"],
                "declaredRiskAppetite": row["K"],
                "churnWarning": str(row["L"]).strip() == "Cao",
                "behaviourNote": row["M"],
            }
        )
    return customers


def export_holdings(workbook: Workbook) -> dict[str, dict[str, int]]:
    rows = workbook.rows(SHEET_HOLDINGS)
    letters = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"]
    holdings = {}
    for row in cif_rows(rows, 4):
        holdings[row["A"]] = {
            code: to_int(row.get(letter)) for code, letter in zip(HOLDING_CODES, letters, strict=True)
        }
    return holdings


def export_nbo(workbook: Workbook) -> dict[str, dict[str, int | None]]:
    rows = workbook.rows(SHEET_NBO)
    letters = ["C", "D", "E", "F", "G"]
    offers = {}
    for row in cif_rows(rows, 5):
        offers[row["A"]] = {}
        for code, letter in zip(NBO_CODES, letters, strict=True):
            raw = row.get(letter)
            offers[row["A"]][code] = None if raw in (None, "-", "") else to_int(raw)
    return offers


def export_metrics(workbook: Workbook) -> list[dict]:
    rows = workbook.rows(SHEET_METRICS)
    golden = []
    for row in cif_rows(rows, 5):
        record: dict[str, object] = {}
        for letter, (key, kind) in METRIC_COLUMNS.items():
            raw = row.get(letter)
            record[key] = to_float(raw) if kind == "float" else (raw or "")
        golden.append(record)
    return golden


def export_journal(workbook: Workbook) -> dict:
    """Return the 365-day journal as a compact column/row table (JSON keeps tsc emitting it to dist)."""
    rows = workbook.rows(SHEET_JOURNAL)
    header = [name for _, name, _ in JOURNAL_COLUMNS]
    records: list[list[object]] = []
    for index in sorted(rows):
        if index < 5:
            continue
        row = rows[index]
        if not row.get("A"):
            continue
        record: list[object] = []
        for letter, _, kind in JOURNAL_COLUMNS:
            raw = row.get(letter)
            if kind == "str":
                record.append(str(raw))
            elif kind == "date":
                record.append(to_iso_date(raw))
            elif kind == "int":
                record.append(to_int(raw))
            elif kind == "active":
                record.append(1 if str(raw).strip() == "Có phát sinh" else 0)
        records.append(record)
    return {"columns": header, "rows": records}


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    source = Path(sys.argv[1]).expanduser()
    workbook = Workbook(source)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    customers = export_customers(workbook)
    holdings = export_holdings(workbook)
    offers = export_nbo(workbook)
    golden = export_metrics(workbook)
    credit_limits = {record["cif"]: int(record["creditLimit"]) for record in golden}
    journal = export_journal(workbook)
    journal_rows = len(journal["rows"])

    # Every customer sheet must describe the same customers, in the same order.
    cifs = [customer["cif"] for customer in customers]
    for sheet, listed in (("Product Holding", list(holdings)), ("Next Best Offer", list(offers)), (SHEET_METRICS, [g["cif"] for g in golden])):
        if listed != cifs:
            sys.exit(f"CIF list of sheet '{sheet}' differs from '{SHEET_CUSTOMERS}'")
    # The as-of date is the last journal day (position_date is the second journal column).
    position_dates = sorted({record[1] for record in journal["rows"]})

    def dump(name: str, payload: object) -> None:
        with (OUTPUT_DIR / name).open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")

    with (OUTPUT_DIR / "daily_positions.json").open("w", encoding="utf-8") as handle:
        json.dump(journal, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    dump("customers.json", customers)
    dump("product_holdings.json", holdings)
    dump("next_best_offers.json", offers)
    dump("credit_limits.json", credit_limits)
    dump("metrics_golden.json", golden)
    dump(
        "manifest.json",
        {
            "source": source.name,
            "asOfDate": position_dates[-1],
            "firstPositionDate": position_dates[0],
            "customers": len(customers),
            "dailyPositions": journal_rows,
            "holdingCodes": HOLDING_CODES,
            "nextBestOfferCodes": NBO_CODES,
        },
    )
    print(f"customers={len(customers)} holdings={len(holdings)} nbo={len(offers)} golden={len(golden)} positions={journal_rows}")
    print(f"written to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
