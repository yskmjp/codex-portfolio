#!/usr/bin/env python3
"""Fetch raw fund price data from official eMAXIS Slim chart endpoints."""

from __future__ import annotations

import csv
import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import List

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "raw_data"
CHART_BASE_URL = "https://www.am.mufg.jp/fund_file/chart/chart_data_{fund_code}.js"


@dataclass(frozen=True)
class FundSpec:
    fund_code: str
    display_name: str
    raw_filename: str


FUNDS = [
    FundSpec("252634", "eMAXIS Slim 国内株式（TOPIX）", "downloaded_emaxis_slim_japan_equity.csv"),
    FundSpec("252648", "eMAXIS Slim 国内債券インデックス", "downloaded_emaxis_slim_japan_bond.csv"),
    FundSpec("252653", "eMAXIS Slim 先進国株式インデックス（除く日本）", "downloaded_emaxis_slim_developed_equity.csv"),
    FundSpec("252667", "eMAXIS Slim 先進国債券インデックス（除く日本）", "downloaded_emaxis_slim_developed_bond.csv"),
]


def fetch_chart_payload(fund_code: str) -> dict:
    url = CHART_BASE_URL.format(fund_code=fund_code)
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def format_date(raw_value: str) -> str:
    if len(raw_value) != 8 or not raw_value.isdigit():
        raise ValueError(f"日付形式を解釈できません: {raw_value}")
    return f"{raw_value[:4]}-{raw_value[4:6]}-{raw_value[6:8]}"


def write_raw_csv(fund: FundSpec, payload: dict) -> Path:
    rows = payload.get("ROWS") or []
    if len(rows) < 24:
        raise ValueError(f"{fund.display_name} の価格履歴が不足しています。")

    RAW_DIR.mkdir(exist_ok=True)
    output_path = RAW_DIR / fund.raw_filename
    with output_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["fund", "date", "nav", "reinvest_nav", "net_asset_value"])
        for row in rows:
            writer.writerow(
                [
                    payload.get("FUND_NAME", fund.display_name),
                    format_date(str(row["BASE_DATE"])),
                    row["BASE_PRICE"],
                    row["REINVEST_BASE_PRICE"],
                    row["NET_ASSET_VALUE"],
                ]
            )
    return output_path


def fetch_all_raw_data() -> List[str]:
    downloaded: List[str] = []
    for fund in FUNDS:
        payload = fetch_chart_payload(fund.fund_code)
        output_path = write_raw_csv(fund, payload)
        downloaded.append(f"{fund.display_name}: {output_path.name}")
    return downloaded


def main() -> None:
    downloaded = fetch_all_raw_data()
    print("Downloaded raw files:")
    for line in downloaded:
        print(f"- {line}")


if __name__ == "__main__":
    main()
