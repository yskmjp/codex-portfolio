#!/usr/bin/env python3
"""Run 10 parameterized portfolio simulations and summarize the outputs."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, List

from portfolio_simulator import (
    ASSETS,
    build_covariance_matrix,
    build_efficient_frontier,
    calculate_portfolio_metrics,
    parse_bounds,
    sample_weights,
)


TEST_CASES: List[Dict[str, object]] = [
    {
        "name": "balanced_default",
        "description": "標準バランス型",
        "bounds": "日本株:0.10:0.50,日本債券:0.00:0.60,先進国株:0.10:0.60,先進国債券:0.00:0.50",
        "max_risk": 0.18,
        "simulations": 12000,
        "steps": 10,
        "seed": 42,
    },
    {
        "name": "conservative_bonds",
        "description": "債券厚めの保守型",
        "bounds": "日本株:0.00:0.25,日本債券:0.25:0.70,先進国株:0.00:0.25,先進国債券:0.10:0.50",
        "max_risk": 0.10,
        "simulations": 12000,
        "steps": 10,
        "seed": 43,
    },
    {
        "name": "growth_global",
        "description": "先進国株重視の成長型",
        "bounds": "日本株:0.00:0.30,日本債券:0.00:0.20,先進国株:0.40:0.80,先進国債券:0.00:0.30",
        "max_risk": 0.20,
        "simulations": 12000,
        "steps": 10,
        "seed": 44,
    },
    {
        "name": "japan_home_bias",
        "description": "日本資産寄り",
        "bounds": "日本株:0.20:0.60,日本債券:0.10:0.50,先進国株:0.00:0.30,先進国債券:0.00:0.30",
        "max_risk": 0.16,
        "simulations": 12000,
        "steps": 10,
        "seed": 45,
    },
    {
        "name": "foreign_diversified",
        "description": "海外分散重視",
        "bounds": "日本株:0.00:0.20,日本債券:0.00:0.25,先進国株:0.30:0.70,先進国債券:0.10:0.50",
        "max_risk": 0.17,
        "simulations": 12000,
        "steps": 10,
        "seed": 46,
    },
    {
        "name": "low_risk_floor",
        "description": "低リスク上限",
        "bounds": "日本株:0.05:0.30,日本債券:0.20:0.65,先進国株:0.05:0.30,先進国債券:0.10:0.45",
        "max_risk": 0.08,
        "simulations": 12000,
        "steps": 10,
        "seed": 47,
    },
    {
        "name": "equity_heavy",
        "description": "株式中心",
        "bounds": "日本株:0.20:0.55,日本債券:0.00:0.15,先進国株:0.25:0.65,先進国債券:0.00:0.20",
        "max_risk": 0.22,
        "simulations": 12000,
        "steps": 10,
        "seed": 48,
    },
    {
        "name": "bond_stability",
        "description": "安定重視",
        "bounds": "日本株:0.00:0.20,日本債券:0.30:0.70,先進国株:0.00:0.20,先進国債券:0.10:0.45",
        "max_risk": 0.07,
        "simulations": 12000,
        "steps": 10,
        "seed": 49,
    },
    {
        "name": "japan_equity_tilt",
        "description": "日本株オーバーウェイト",
        "bounds": "日本株:0.30:0.70,日本債券:0.00:0.25,先進国株:0.10:0.40,先進国債券:0.00:0.25",
        "max_risk": 0.19,
        "simulations": 12000,
        "steps": 10,
        "seed": 50,
    },
    {
        "name": "global_income",
        "description": "インカム寄り国際分散",
        "bounds": "日本株:0.00:0.25,日本債券:0.10:0.40,先進国株:0.20:0.45,先進国債券:0.20:0.50",
        "max_risk": 0.13,
        "simulations": 12000,
        "steps": 10,
        "seed": 51,
    },
]


def to_percent(value: float) -> str:
    return f"{value * 100:.2f}%"


def main() -> None:
    output_dir = Path(__file__).resolve().parents[1] / "test_output"
    output_dir.mkdir(exist_ok=True)
    covariance = build_covariance_matrix(ASSETS)

    summary_rows: List[Dict[str, str]] = []
    markdown_lines: List[str] = ["# 10パターン テスト結果", ""]

    for case in TEST_CASES:
        bounds = parse_bounds(str(case["bounds"]), ASSETS)
        weights = sample_weights(bounds, ASSETS, int(case["simulations"]), int(case["seed"]))
        returns, risks = calculate_portfolio_metrics(weights, ASSETS, covariance)
        frontier = build_efficient_frontier(
            weights,
            returns,
            risks,
            float(case["max_risk"]),
            int(case["steps"]),
        )

        if not frontier:
            raise ValueError(f"{case['name']} で効率的フロンティアが生成されませんでした。")

        best = frontier[-1]
        row = {
            "case_name": str(case["name"]),
            "description": str(case["description"]),
            "max_risk": f"{float(case['max_risk']):.4f}",
            "best_return": f"{float(best['return']):.4f}",
            "realized_risk": f"{float(best['risk']):.4f}",
        }
        for asset, weight in zip(ASSETS, best["weights"]):
            row[asset.name] = f"{float(weight):.4f}"
        summary_rows.append(row)

        markdown_lines.append(f"## {case['name']}")
        markdown_lines.append(f"- 説明: {case['description']}")
        markdown_lines.append(f"- 最大許容リスク: {to_percent(float(case['max_risk']))}")
        markdown_lines.append(f"- 最大期待リターン: {to_percent(float(best['return']))}")
        markdown_lines.append(f"- 実現リスク: {to_percent(float(best['risk']))}")
        for asset, weight in zip(ASSETS, best["weights"]):
            markdown_lines.append(f"- {asset.name}: {to_percent(float(weight))}")
        markdown_lines.append("")

    csv_path = output_dir / "test_results.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as csv_file:
        fieldnames = ["case_name", "description", "max_risk", "best_return", "realized_risk"] + [asset.name for asset in ASSETS]
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(summary_rows)

    markdown_path = output_dir / "test_results.md"
    markdown_path.write_text("\n".join(markdown_lines), encoding="utf-8")

    print(f"CSV: {csv_path}")
    print(f"Markdown: {markdown_path}")


if __name__ == "__main__":
    main()
