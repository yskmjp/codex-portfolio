#!/usr/bin/env python3
"""Local web server for the portfolio simulator with mutual fund data API."""

from __future__ import annotations

import csv
import json
import math
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

from fetch_raw_fund_data import fetch_all_raw_data
from normalize_fund_data import main as normalize_main

HOST = "127.0.0.1"
PORT = 8000
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"

ASSET_FUNDS = [
    {
        "name": "日本株",
        "fund": "eMAXIS Slim 国内株式（TOPIX）",
        "filename": "emaxis_slim_japan_equity.csv",
    },
    {
        "name": "日本債券",
        "fund": "eMAXIS Slim 国内債券インデックス",
        "filename": "emaxis_slim_japan_bond.csv",
    },
    {
        "name": "先進国株",
        "fund": "eMAXIS Slim 先進国株式インデックス",
        "filename": "emaxis_slim_developed_equity.csv",
    },
    {
        "name": "先進国債券",
        "fund": "eMAXIS Slim 先進国債券インデックス",
        "filename": "emaxis_slim_developed_bond.csv",
    },
]


def parse_date(raw_value: str) -> str:
    for date_format in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d"):
        try:
            return datetime.strptime(raw_value.strip(), date_format).strftime("%Y-%m-%d")
        except ValueError:
            continue
    raise ValueError(f"日付形式を解釈できません: {raw_value}")


def parse_nav(raw_value: str) -> float:
    cleaned = raw_value.replace(",", "").strip()
    value = float(cleaned)
    if value <= 0:
        raise ValueError("基準価額は正の値である必要があります。")
    return value


def load_fund_prices(file_path: Path) -> List[Tuple[str, float]]:
    if not file_path.exists():
        raise FileNotFoundError(f"{file_path.name} が見つかりません。")

    with file_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if not reader.fieldnames:
            raise ValueError(f"{file_path.name} のヘッダーが読めません。")

        normalized = {field.strip().lower(): field for field in reader.fieldnames}
        date_key = normalized.get("date") or normalized.get("日付")
        nav_key = normalized.get("nav") or normalized.get("基準価額")
        if not date_key or not nav_key:
            raise ValueError(
                f"{file_path.name} には 'date' と 'nav' または '日付' と '基準価額' の列が必要です。"
            )

        rows: List[Tuple[str, float]] = []
        for row in reader:
            raw_date = (row.get(date_key) or "").strip()
            raw_nav = (row.get(nav_key) or "").strip()
            if not raw_date or not raw_nav:
                continue
            rows.append((parse_date(raw_date), parse_nav(raw_nav)))

    rows.sort(key=lambda item: item[0])
    if len(rows) < 24:
        raise ValueError(f"{file_path.name} のデータ件数が不足しています。最低24件必要です。")
    return rows


def build_monthly_series(prices: Sequence[Tuple[str, float]]) -> List[Tuple[str, float]]:
    monthly: Dict[str, Tuple[str, float]] = {}
    for date_value, nav in prices:
        month_key = date_value[:7]
        monthly[month_key] = (date_value, nav)
    return [monthly[key] for key in sorted(monthly)]


def build_returns(closes: Sequence[Tuple[str, float]]) -> Dict[str, float]:
    returns: Dict[str, float] = {}
    for index in range(1, len(closes)):
        previous_close = closes[index - 1][1]
        current_date, current_close = closes[index]
        returns[current_date] = (current_close / previous_close) - 1.0
    return returns


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values)


def sample_variance(values: Sequence[float]) -> float:
    average = mean(values)
    return sum((value - average) ** 2 for value in values) / (len(values) - 1)


def sample_covariance(first: Sequence[float], second: Sequence[float]) -> float:
    avg_first = mean(first)
    avg_second = mean(second)
    total = sum((left - avg_first) * (right - avg_second) for left, right in zip(first, second))
    return total / (len(first) - 1)


def correlation_from_covariance(covariance: float, std_first: float, std_second: float) -> float:
    if std_first == 0 or std_second == 0:
        return 0.0
    return covariance / (std_first * std_second)


def calculate_market_data() -> Dict[str, object]:
    histories = []
    for asset in ASSET_FUNDS:
        monthly_prices = build_monthly_series(load_fund_prices(DATA_DIR / asset["filename"]))
        returns = build_returns(monthly_prices)
        histories.append({"asset": asset, "prices": monthly_prices, "returns": returns})

    shared_dates = sorted(set.intersection(*(set(item["returns"].keys()) for item in histories)))
    if len(shared_dates) < 12:
        raise ValueError("共通の月次リターン期間が不足しています。")

    aligned_returns = [
        [history["returns"][date_value] for date_value in shared_dates]
        for history in histories
    ]

    monthly_means = [mean(series) for series in aligned_returns]
    monthly_variances = [sample_variance(series) for series in aligned_returns]
    monthly_std = [math.sqrt(max(variance, 0.0)) for variance in monthly_variances]

    covariance_matrix: List[List[float]] = []
    correlation_matrix: List[List[float]] = []
    for row_index, row_series in enumerate(aligned_returns):
        covariance_row: List[float] = []
        correlation_row: List[float] = []
        for column_index, column_series in enumerate(aligned_returns):
            monthly_covariance = sample_covariance(row_series, column_series)
            covariance_row.append(monthly_covariance * 12.0)
            correlation_row.append(
                correlation_from_covariance(
                    monthly_covariance,
                    monthly_std[row_index],
                    monthly_std[column_index],
                )
            )
        covariance_matrix.append(covariance_row)
        correlation_matrix.append(correlation_row)

    expected_returns = [value * 12.0 for value in monthly_means]
    annual_volatility = [value * math.sqrt(12.0) for value in monthly_std]

    return {
        "source": "Local mutual fund NAV CSV",
        "frequency": "monthly",
        "periodStart": shared_dates[0],
        "periodEnd": shared_dates[-1],
        "observationCount": len(shared_dates),
        "assets": ASSET_FUNDS,
        "expectedReturns": expected_returns,
        "volatility": annual_volatility,
        "covariance": covariance_matrix,
        "correlation": correlation_matrix,
    }


class PortfolioHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self) -> None:
        if self.path == "/api/market-data":
            self.handle_market_data()
            return
        if self.path == "/api/fetch-market-data":
            self.handle_fetch_market_data()
            return
        super().do_GET()

    def handle_market_data(self) -> None:
        try:
            payload = calculate_market_data()
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
        except Exception as error:
            body = json.dumps({"error": str(error)}, ensure_ascii=False).encode("utf-8")
            self.send_response(500)

        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_fetch_market_data(self) -> None:
        try:
            downloaded = fetch_all_raw_data()
            normalize_main()
            payload = calculate_market_data()
            payload["downloadedFiles"] = downloaded
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
        except Exception as error:
            body = json.dumps({"error": str(error)}, ensure_ascii=False).encode("utf-8")
            self.send_response(500)

        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), PortfolioHandler)
    print(f"Serving on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
