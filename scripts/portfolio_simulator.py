#!/usr/bin/env python3
"""Efficient frontier simulator for a four-asset portfolio."""

from __future__ import annotations

import argparse
import csv
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

@dataclass(frozen=True)
class Asset:
    name: str
    expected_return: float
    volatility: float


ASSETS: List[Asset] = [
    Asset("日本株", 0.055, 0.18),
    Asset("日本債券", 0.008, 0.04),
    Asset("先進国株", 0.07, 0.20),
    Asset("先進国債券", 0.02, 0.07),
]

CORRELATION = [
    [1.00, 0.20, 0.75, 0.25],
    [0.20, 1.00, 0.15, 0.55],
    [0.75, 0.15, 1.00, 0.35],
    [0.25, 0.55, 0.35, 1.00],
]


def build_covariance_matrix(assets: Sequence[Asset]) -> List[List[float]]:
    vol = [asset.volatility for asset in assets]
    covariance: List[List[float]] = []
    for i in range(len(assets)):
        row: List[float] = []
        for j in range(len(assets)):
            row.append(vol[i] * vol[j] * CORRELATION[i][j])
        covariance.append(row)
    return covariance


def parse_bounds(raw_bounds: str, assets: Sequence[Asset]) -> Dict[str, Tuple[float, float]]:
    bounds: Dict[str, Tuple[float, float]] = {asset.name: (0.0, 1.0) for asset in assets}
    if not raw_bounds:
        return bounds

    for item in raw_bounds.split(","):
        name, minimum, maximum = item.split(":")
        asset_name = name.strip()
        bounds[asset_name] = (float(minimum), float(maximum))

    total_min = sum(minimum for minimum, _ in bounds.values())
    total_max = sum(maximum for _, maximum in bounds.values())
    if total_min > 1.0 + 1e-9:
        raise ValueError("各資産の最小配分合計が100%を超えています。")
    if total_max < 1.0 - 1e-9:
        raise ValueError("各資産の最大配分合計が100%未満なので配分を作れません。")
    return bounds


def sample_weights(
    bounds: Dict[str, Tuple[float, float]],
    assets: Sequence[Asset],
    simulations: int,
    seed: int,
) -> List[List[float]]:
    random.seed(seed)
    accepted: List[List[float]] = []
    minima = [bounds[asset.name][0] for asset in assets]
    maxima = [bounds[asset.name][1] for asset in assets]
    slack = [maximum - minimum for minimum, maximum in zip(minima, maxima)]
    remaining_target = 1.0 - sum(minima)

    if any(value < -1e-9 for value in slack):
        raise ValueError("最小配分が最大配分を超えている資産があります。")

    while len(accepted) < simulations:
        trial = [random.random() for _ in assets]
        trial_sum = sum(trial)
        if trial_sum == 0.0:
            continue

        scaled = [
            minimum + remaining_target * (value / trial_sum)
            for minimum, value in zip(minima, trial)
        ]
        if all(value <= maximum + 1e-9 for value, maximum in zip(scaled, maxima)):
            scaled_sum = sum(scaled)
            accepted.append([value / scaled_sum for value in scaled])
            continue

        capped = minima[:]
        remaining = remaining_target
        active = [index for index in range(len(assets))]
        proportions = trial[:]

        while active and remaining > 1e-10:
            active_weights = [proportions[index] for index in active]
            weight_sum = sum(active_weights)
            if weight_sum == 0.0:
                active_weights = [remaining / len(active)] * len(active)
            else:
                active_weights = [remaining * (value / weight_sum) for value in active_weights]

            overflow = False
            next_active: List[int] = []
            next_remaining = remaining
            for position, asset_index in enumerate(active):
                proposal = capped[asset_index] + active_weights[position]
                if proposal > maxima[asset_index] + 1e-9:
                    next_remaining -= maxima[asset_index] - capped[asset_index]
                    capped[asset_index] = maxima[asset_index]
                    overflow = True
                else:
                    next_active.append(asset_index)

            if not overflow:
                for position, asset_index in enumerate(active):
                    capped[asset_index] += active_weights[position]
                remaining = 0.0
            else:
                active = next_active
                remaining = next_remaining

        if abs(sum(capped) - 1.0) <= 1e-6 and all(value <= maximum + 1e-9 for value, maximum in zip(capped, maxima)):
            capped_sum = sum(capped)
            accepted.append([value / capped_sum for value in capped])

    return accepted


def calculate_portfolio_metrics(
    weights: Sequence[Sequence[float]],
    assets: Sequence[Asset],
    covariance: Sequence[Sequence[float]],
) -> Tuple[List[float], List[float]]:
    expected_returns = [asset.expected_return for asset in assets]
    portfolio_returns: List[float] = []
    portfolio_risks: List[float] = []

    for portfolio in weights:
        portfolio_return = sum(weight * asset_return for weight, asset_return in zip(portfolio, expected_returns))
        variance = 0.0
        for i, weight_i in enumerate(portfolio):
            for j, weight_j in enumerate(portfolio):
                variance += weight_i * covariance[i][j] * weight_j
        portfolio_returns.append(portfolio_return)
        portfolio_risks.append(math.sqrt(max(variance, 0.0)))

    return portfolio_returns, portfolio_risks


def build_efficient_frontier(
    weights: Sequence[Sequence[float]],
    portfolio_returns: Sequence[float],
    portfolio_risks: Sequence[float],
    max_risk: float,
    step_count: int,
) -> List[Dict[str, object]]:
    frontier: List[Dict[str, object]] = []
    if step_count <= 1:
        tolerances = [max_risk]
    else:
        tolerances = [max_risk * step / (step_count - 1) for step in range(step_count)]

    for tolerance in tolerances:
        feasible = [
            index for index, risk in enumerate(portfolio_risks)
            if risk <= tolerance + 1e-9
        ]
        if not feasible:
            continue

        best_index = max(feasible, key=lambda index: portfolio_returns[index])
        frontier.append(
            {
                "risk_tolerance": float(tolerance),
                "return": float(portfolio_returns[best_index]),
                "risk": float(portfolio_risks[best_index]),
                "weights": weights[best_index],
            }
        )
    return frontier


def write_frontier_csv(frontier: Sequence[Dict[str, object]], assets: Sequence[Asset], output_path: Path) -> None:
    with output_path.open("w", newline="", encoding="utf-8") as csv_file:
        fieldnames = ["許容リスク", "実現リスク", "期待リターン"] + [asset.name for asset in assets]
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        for item in frontier:
            row = {
                "許容リスク": f"{item['risk_tolerance']:.4f}",
                "実現リスク": f"{item['risk']:.4f}",
                "期待リターン": f"{item['return']:.4f}",
            }
            for asset, weight in zip(assets, item["weights"]):
                row[asset.name] = f"{float(weight):.4f}"
            writer.writerow(row)


def plot_results(
    weights: Sequence[Sequence[float]],
    portfolio_returns: Sequence[float],
    portfolio_risks: Sequence[float],
    frontier: Sequence[Dict[str, object]],
    output_path: Path,
) -> None:
    width = 960
    height = 640
    margin_left = 90
    margin_right = 40
    margin_top = 50
    margin_bottom = 80
    plot_width = width - margin_left - margin_right
    plot_height = height - margin_top - margin_bottom

    max_risk = max(max(portfolio_risks), max((item["risk"] for item in frontier), default=0.0))
    max_return = max(max(portfolio_returns), max((item["return"] for item in frontier), default=0.0))
    min_return = min(min(portfolio_returns), min((item["return"] for item in frontier), default=0.0))
    risk_padding = max(max_risk * 0.05, 0.01)
    return_padding = max((max_return - min_return) * 0.1, 0.01)

    x_min = 0.0
    x_max = max_risk + risk_padding
    y_min = max(0.0, min_return - return_padding)
    y_max = max_return + return_padding

    def scale_x(value: float) -> float:
        return margin_left + ((value - x_min) / (x_max - x_min)) * plot_width

    def scale_y(value: float) -> float:
        return height - margin_bottom - ((value - y_min) / (y_max - y_min)) * plot_height

    grid_lines: List[str] = []
    for step in range(6):
        x = margin_left + (plot_width / 5) * step
        y = margin_top + (plot_height / 5) * step
        risk_label = x_min + (x_max - x_min) * (step / 5)
        return_label = y_max - (y_max - y_min) * (step / 5)
        grid_lines.append(
            f'<line x1="{x:.2f}" y1="{margin_top}" x2="{x:.2f}" y2="{height - margin_bottom}" '
            'stroke="#d9dde3" stroke-width="1" />'
        )
        grid_lines.append(
            f'<text x="{x:.2f}" y="{height - margin_bottom + 28}" text-anchor="middle" '
            f'font-size="14" fill="#334155">{risk_label:.1%}</text>'
        )
        grid_lines.append(
            f'<line x1="{margin_left}" y1="{y:.2f}" x2="{width - margin_right}" y2="{y:.2f}" '
            'stroke="#d9dde3" stroke-width="1" />'
        )
        grid_lines.append(
            f'<text x="{margin_left - 12}" y="{y + 5:.2f}" text-anchor="end" '
            f'font-size="14" fill="#334155">{return_label:.1%}</text>'
        )

    points = "\n".join(
        f'<circle cx="{scale_x(float(risk)):.2f}" cy="{scale_y(float(ret)):.2f}" r="3" '
        'fill="#5B8FF9" fill-opacity="0.20" />'
        for risk, ret in zip(portfolio_risks, portfolio_returns)
    )

    frontier_path = ""
    if frontier:
        path_points = [
            f"{scale_x(float(item['risk'])):.2f},{scale_y(float(item['return'])):.2f}"
            for item in frontier
        ]
        frontier_path = (
            f'<polyline points="{" ".join(path_points)}" fill="none" stroke="#D1495B" stroke-width="3" />'
        )

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<rect width="100%" height="100%" fill="#f8fafc" />
<text x="{width / 2:.0f}" y="30" text-anchor="middle" font-size="24" fill="#0f172a">効率的フロンティア</text>
<rect x="{margin_left}" y="{margin_top}" width="{plot_width}" height="{plot_height}" fill="#ffffff" stroke="#cbd5e1" />
{''.join(grid_lines)}
<line x1="{margin_left}" y1="{height - margin_bottom}" x2="{width - margin_right}" y2="{height - margin_bottom}" stroke="#334155" stroke-width="2" />
<line x1="{margin_left}" y1="{margin_top}" x2="{margin_left}" y2="{height - margin_bottom}" stroke="#334155" stroke-width="2" />
{points}
{frontier_path}
<text x="{width / 2:.0f}" y="{height - 25}" text-anchor="middle" font-size="18" fill="#0f172a">リスク（標準偏差）</text>
<text x="25" y="{height / 2:.0f}" text-anchor="middle" font-size="18" fill="#0f172a" transform="rotate(-90 25 {height / 2:.0f})">期待リターン</text>
<circle cx="{width - 220}" cy="40" r="5" fill="#5B8FF9" fill-opacity="0.40" />
<text x="{width - 205}" y="45" font-size="14" fill="#334155">シミュレーション結果</text>
<line x1="{width - 220}" y1="65" x2="{width - 190}" y2="65" stroke="#D1495B" stroke-width="3" />
<text x="{width - 180}" y="70" font-size="14" fill="#334155">効率的フロンティア</text>
</svg>
"""
    output_path.write_text(svg, encoding="utf-8")


def format_summary(frontier: Sequence[Dict[str, object]], assets: Sequence[Asset]) -> str:
    if not frontier:
        return "指定条件を満たすポートフォリオが見つかりませんでした。"

    lines = ["許容リスクごとの最大期待リターン配分"]
    for item in frontier:
        weights = ", ".join(
            f"{asset.name}: {float(weight) * 100:.1f}%"
            for asset, weight in zip(assets, item["weights"])
        )
        lines.append(
            f"- 許容リスク {item['risk_tolerance']:.2%} -> 期待リターン {item['return']:.2%}, "
            f"実現リスク {item['risk']:.2%}, {weights}"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="効率的フロンティアをシミュレーションします。")
    parser.add_argument(
        "--bounds",
        default="",
        help=(
            "資産ごとの最小値・最大値を '日本株:0.1:0.5,日本債券:0.0:0.6,...' "
            "の形式で指定"
        ),
    )
    parser.add_argument("--max-risk", type=float, default=0.18, help="許容できる最大リスク")
    parser.add_argument("--simulations", type=int, default=20000, help="シミュレーション回数")
    parser.add_argument("--steps", type=int, default=12, help="許容リスクの刻み数")
    parser.add_argument("--seed", type=int, default=42, help="乱数シード")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output"),
        help="出力先ディレクトリ",
    )
    args = parser.parse_args()

    bounds = parse_bounds(args.bounds, ASSETS)
    covariance = build_covariance_matrix(ASSETS)
    weights = sample_weights(bounds, ASSETS, args.simulations, args.seed)
    portfolio_returns, portfolio_risks = calculate_portfolio_metrics(weights, ASSETS, covariance)
    frontier = build_efficient_frontier(
        weights,
        portfolio_returns,
        portfolio_risks,
        args.max_risk,
        args.steps,
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.output_dir / "efficient_frontier.csv"
    chart_path = args.output_dir / "efficient_frontier.svg"
    summary_path = args.output_dir / "summary.txt"

    write_frontier_csv(frontier, ASSETS, csv_path)
    plot_results(weights, portfolio_returns, portfolio_risks, frontier, chart_path)
    summary_path.write_text(format_summary(frontier, ASSETS), encoding="utf-8")

    print(f"CSV: {csv_path}")
    print(f"Chart: {chart_path}")
    print(f"Summary: {summary_path}")


if __name__ == "__main__":
    main()
