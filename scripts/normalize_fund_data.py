#!/usr/bin/env python3
"""Normalize downloaded mutual fund price files into the app's data format."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "raw_data"
OUTPUT_DIR = BASE_DIR / "data"

TARGETS = [
    {
        "asset": "日本株",
        "fund": "eMAXIS Slim 国内株式（TOPIX）",
        "output": "emaxis_slim_japan_equity.csv",
        "keywords": [
            "国内株式（topix）",
            "国内株式(topix)",
            "国内株式 topix",
            "topix",
            "japan_equity",
            "japan equity",
            "downloaded emaxis slim japan equity",
        ],
    },
    {
        "asset": "日本債券",
        "fund": "eMAXIS Slim 国内債券インデックス",
        "output": "emaxis_slim_japan_bond.csv",
        "keywords": [
            "国内債券インデックス",
            "国内債券",
            "japan_bond",
            "japan bond",
            "downloaded emaxis slim japan bond",
        ],
    },
    {
        "asset": "先進国株",
        "fund": "eMAXIS Slim 先進国株式インデックス",
        "output": "emaxis_slim_developed_equity.csv",
        "keywords": [
            "先進国株式インデックス",
            "先進国株式",
            "developed_equity",
            "先進国株",
            "developed equity",
            "downloaded emaxis slim developed equity",
        ],
    },
    {
        "asset": "先進国債券",
        "fund": "eMAXIS Slim 先進国債券インデックス",
        "output": "emaxis_slim_developed_bond.csv",
        "keywords": [
            "先進国債券インデックス",
            "先進国債券",
            "developed_bond",
            "先進国債",
            "developed bond",
            "downloaded emaxis slim developed bond",
        ],
    },
]

DATE_HEADERS = ["date", "日付", "基準日", "年月日"]
NAV_HEADERS = ["nav", "基準価額", "基準価額(円)", "基準価額（円）", "price", "value", "base_price"]
NAME_HEADERS = ["fund", "ファンド名", "名称", "商品名", "銘柄名"]
ENCODINGS = ["utf-8-sig", "cp932", "utf-8"]
DELIMITERS = [",", "\t", ";"]


def normalize_text(value: str) -> str:
    return (
        value.strip()
        .lower()
        .replace("　", " ")
        .replace("_", " ")
        .replace("-", " ")
    )


def sniff_delimiter(sample: str) -> str:
    best = ","
    best_count = -1
    for delimiter in DELIMITERS:
        count = sample.count(delimiter)
        if count > best_count:
            best = delimiter
            best_count = count
    return best


def read_rows(file_path: Path) -> Tuple[List[Dict[str, str]], List[str]]:
    last_error: Exception | None = None
    for encoding in ENCODINGS:
        try:
            text = file_path.read_text(encoding=encoding)
        except UnicodeDecodeError as error:
            last_error = error
            continue

        delimiter = sniff_delimiter(text[:2000])
        reader = csv.DictReader(text.splitlines(), delimiter=delimiter)
        if not reader.fieldnames:
            continue
        rows = [{key.strip(): (value or "").strip() for key, value in row.items()} for row in reader]
        return rows, [field.strip() for field in reader.fieldnames]

    if last_error is not None:
        raise last_error
    raise ValueError(f"{file_path.name} の読み込みに失敗しました。")


def find_header(fieldnames: Sequence[str], candidates: Sequence[str]) -> str | None:
    normalized = {normalize_text(field): field for field in fieldnames}
    for candidate in candidates:
        if normalize_text(candidate) in normalized:
            return normalized[normalize_text(candidate)]
    for field in fieldnames:
        norm = normalize_text(field)
        for candidate in candidates:
            if normalize_text(candidate) in norm:
                return field
    return None


def guess_target(file_path: Path, rows: Sequence[Dict[str, str]], fieldnames: Sequence[str]) -> Dict[str, object]:
    name_header = find_header(fieldnames, NAME_HEADERS)
    probe_texts = [normalize_text(file_path.stem), normalize_text(file_path.name)]

    if name_header:
        for row in rows[:20]:
            value = row.get(name_header, "")
            if value:
                probe_texts.append(normalize_text(value))

    combined = " ".join(probe_texts)
    for target in TARGETS:
        if any(keyword in combined for keyword in target["keywords"]):
            return target

    raise ValueError(f"{file_path.name} のファンド種別を判定できませんでした。")


def parse_date(raw_value: str) -> str:
    for separator in ("-", "/", "."):
        if separator in raw_value:
            parts = raw_value.strip().split(separator)
            if len(parts) == 3:
                year, month, day = parts
                return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    numeric = "".join(character for character in raw_value if character.isdigit())
    if len(numeric) == 8:
        return f"{numeric[:4]}-{numeric[4:6]}-{numeric[6:8]}"
    raise ValueError(f"日付形式を解釈できません: {raw_value}")


def parse_nav(raw_value: str) -> float:
    cleaned = raw_value.replace(",", "").replace("円", "").strip()
    return float(cleaned)


def normalize_rows(rows: Sequence[Dict[str, str]], fieldnames: Sequence[str]) -> List[Tuple[str, float]]:
    date_header = find_header(fieldnames, DATE_HEADERS)
    nav_header = find_header(fieldnames, NAV_HEADERS)
    if not date_header or not nav_header:
        raise ValueError("日付列または基準価額列を判定できませんでした。")

    normalized: Dict[str, float] = {}
    for row in rows:
        raw_date = row.get(date_header, "")
        raw_nav = row.get(nav_header, "")
        if not raw_date or not raw_nav:
            continue
        normalized[parse_date(raw_date)] = parse_nav(raw_nav)

    if len(normalized) < 24:
        raise ValueError("正規化後のデータ件数が24件未満です。")

    return sorted(normalized.items())


def write_output(target: Dict[str, object], rows: Iterable[Tuple[str, float]]) -> Path:
    OUTPUT_DIR.mkdir(exist_ok=True)
    output_path = OUTPUT_DIR / str(target["output"])
    with output_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["date", "nav"])
        for date_value, nav in rows:
            writer.writerow([date_value, f"{nav:.4f}"])
    return output_path


def main() -> None:
    RAW_DIR.mkdir(exist_ok=True)
    files = sorted(path for path in RAW_DIR.iterdir() if path.is_file() and path.suffix.lower() in {".csv", ".txt", ".tsv"})
    if not files:
        raise SystemExit("raw_data に元データファイルがありません。")

    written: List[str] = []
    seen_outputs: set[str] = set()

    for file_path in files:
        rows, fieldnames = read_rows(file_path)
        target = guess_target(file_path, rows, fieldnames)
        output_name = str(target["output"])
        if output_name in seen_outputs:
            raise SystemExit(f"{output_name} に対応する元データが複数あります。raw_data を整理してください。")

        normalized_rows = normalize_rows(rows, fieldnames)
        output_path = write_output(target, normalized_rows)
        seen_outputs.add(output_name)
        written.append(f"{file_path.name} -> {output_path.name}")

    print("Normalized files:")
    for line in written:
        print(f"- {line}")


if __name__ == "__main__":
    main()
