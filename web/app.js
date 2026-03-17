const DEFAULT_ASSETS = [
  { name: "日本株式", expectedReturn: 0.055, volatility: 0.18, min: 10, max: 50 },
  { name: "日本債券", expectedReturn: 0.008, volatility: 0.04, min: 10, max: 50 },
  { name: "先進国株式", expectedReturn: 0.07, volatility: 0.2, min: 10, max: 50 },
  { name: "先進国債券", expectedReturn: 0.02, volatility: 0.07, min: 10, max: 50 },
  { name: "新興国株式", expectedReturn: 0.085, volatility: 0.24, min: 10, max: 50 },
  { name: "新興国債券", expectedReturn: 0.035, volatility: 0.11, min: 10, max: 50 },
];

const LIVE_FUNDS = [
  {
    name: "日本株式",
    fund: "eMAXIS Slim 国内株式（TOPIX）",
    fundCode: "252634",
    downloadUrl: "https://www.am.mufg.jp/fund_file/chart/chart_data_252634.js",
    downloadLabel: "公式データを開く",
  },
  {
    name: "日本債券",
    fund: "eMAXIS Slim 国内債券インデックス",
    fundCode: "252648",
    downloadUrl: "https://www.am.mufg.jp/fund_file/chart/chart_data_252648.js",
    downloadLabel: "公式データを開く",
  },
  {
    name: "先進国株式",
    fund: "eMAXIS Slim 先進国株式インデックス（除く日本）",
    fundCode: "252653",
    downloadUrl: "https://www.am.mufg.jp/fund_file/chart/chart_data_252653.js",
    downloadLabel: "公式データを開く",
  },
  {
    name: "先進国債券",
    fund: "eMAXIS Slim 先進国債券インデックス（除く日本）",
    fundCode: "252667",
    downloadUrl: "https://www.am.mufg.jp/fund_file/chart/chart_data_252667.js",
    downloadLabel: "公式データを開く",
  },
  {
    name: "新興国株式",
    fund: "eMAXIS Slim 新興国株式インデックス",
    fundCode: "252878",
    downloadUrl: "https://www.am.mufg.jp/fund_file/chart/chart_data_252878.js",
    downloadLabel: "公式データを開く",
  },
  {
    name: "新興国債券",
    fund: "iFree 新興国債券インデックス",
    fundCode: "3316",
    downloadUrl: "https://www.daiwa-am.co.jp/funds/detail/3316/detail_top.html",
    downloadLabel: "公式ページを開く",
  },
];

const DEFAULT_CORRELATION = [
  [1.0, 0.2, 0.75, 0.25, 0.72, 0.3],
  [0.2, 1.0, 0.15, 0.55, 0.12, 0.35],
  [0.75, 0.15, 1.0, 0.35, 0.82, 0.45],
  [0.25, 0.55, 0.35, 1.0, 0.28, 0.6],
  [0.72, 0.12, 0.82, 0.28, 1.0, 0.42],
  [0.3, 0.35, 0.45, 0.6, 0.42, 1.0],
];

const BENCHMARK_INDEXES = [
  { name: "日本株式", index: "TOPIX", expectedReturn: 0.06, volatility: 0.18 },
  { name: "日本債券", index: "NOMURA-BPI 総合", expectedReturn: 0.007, volatility: 0.035 },
  { name: "先進国株式", index: "MSCI Kokusai", expectedReturn: 0.072, volatility: 0.19 },
  { name: "先進国債券", index: "FTSE 世界国債（除く日本）", expectedReturn: 0.022, volatility: 0.075 },
  { name: "新興国株式", index: "MSCI Emerging Markets", expectedReturn: 0.082, volatility: 0.24 },
  { name: "新興国債券", index: "JP Morgan EMBI Global Diversified", expectedReturn: 0.045, volatility: 0.11 },
];

const state = {
  frontier: [],
  csv: "",
  marketData: null,
  dataMode: "fallback",
};

const dataDownloads = document.getElementById("data-downloads");
const assetInputs = document.getElementById("asset-inputs");
const form = document.getElementById("simulator-form");
const message = document.getElementById("message");
const chart = document.getElementById("chart");
const benchmarkChart = document.getElementById("benchmark-chart");
const marketMeta = document.getElementById("market-meta");
const benchmarkReference = document.getElementById("benchmark-reference");
const correlationHead = document.getElementById("correlation-head");
const correlationBody = document.getElementById("correlation-body");
const benchmarkCorrelationHead = document.getElementById("benchmark-correlation-head");
const benchmarkCorrelationBody = document.getElementById("benchmark-correlation-body");
const fetchDataButton = document.getElementById("fetch-data-button");
const resetButton = document.getElementById("reset-button");

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function buildDefaultCovariance() {
  return DEFAULT_ASSETS.map((asset, rowIndex) =>
    DEFAULT_ASSETS.map(
      (otherAsset, columnIndex) =>
        asset.volatility * otherAsset.volatility * DEFAULT_CORRELATION[rowIndex][columnIndex]
    )
  );
}

function buildBenchmarkCovariance() {
  return BENCHMARK_INDEXES.map((asset, rowIndex) =>
    BENCHMARK_INDEXES.map(
      (otherAsset, columnIndex) =>
        asset.volatility * otherAsset.volatility * DEFAULT_CORRELATION[rowIndex][columnIndex]
    )
  );
}

function formatDate(rawValue) {
  const value = String(rawValue);
  if (value.length !== 8) {
    throw new Error(`日付形式を解釈できません: ${rawValue}`);
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function formatUnixDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (character === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  result.push(current);
  return result;
}

function parseCsvRows(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim());

  if (lines.length < 2) {
    throw new Error("CSVの行数が不足しています。");
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || "").trim();
    });
    return row;
  });
}

function findHeader(headers, candidates) {
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  for (const candidate of candidates) {
    const index = normalizedHeaders.indexOf(candidate.toLowerCase());
    if (index !== -1) {
      return headers[index];
    }
  }
  return null;
}

function parseYahooCsv(text) {
  const rows = parseCsvRows(text);
  const headers = Object.keys(rows[0] || {});
  const dateHeader = findHeader(headers, ["Date", "date", "日付", "基準日"]);
  const adjCloseHeader = findHeader(headers, ["Adj Close", "Adj close", "adj close"]);
  const closeHeader = findHeader(headers, ["Close", "close", "基準価額", "基準価額(円)", "基準価額(10,000口当たり)"]);
  const navHeader = findHeader(headers, ["nav", "NAV", "price", "Price", "基準価額", "基準価額(円)", "基準価額(10,000口当たり)"]);

  if (!dateHeader || (!adjCloseHeader && !closeHeader && !navHeader)) {
    throw new Error("対応している履歴CSV形式ではありません。");
  }

  return rows
    .map((row) => {
      const rawDate = row[dateHeader];
      const rawNav = row[adjCloseHeader] || row[closeHeader] || row[navHeader];
      const nav = Number(rawNav.replace(/,/g, ""));
      let date = rawDate;
      if (/^\d{8}$/.test(rawDate)) {
        date = formatDate(rawDate);
      } else if (rawDate.includes("年")) {
        date = normalizeJapaneseDate(rawDate);
      }
      return {
        date,
        nav,
      };
    })
    .filter((row) => row.date && Number.isFinite(row.nav) && row.nav > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function parseOfficialChartData(text) {
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  let payload = null;

  try {
    payload = JSON.parse(trimmed);
  } catch (_error) {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      payload = JSON.parse(jsonMatch[0]);
    }
  }

  if (!payload || !Array.isArray(payload.ROWS)) {
    throw new Error("公式データ形式として解析できませんでした。");
  }

  return payload.ROWS.map((row) => ({
    date: formatDate(String(row.BASE_DATE)),
    nav: Number(row.BASE_PRICE),
  }))
    .filter((row) => row.date && Number.isFinite(row.nav) && row.nav > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeJapaneseDate(rawValue) {
  const match = rawValue.trim().match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) {
    return rawValue.trim();
  }
  const [, year, month, day] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseYahooJapanHtml(text) {
  if (typeof DOMParser === "undefined") {
    throw new Error("この環境ではHTML解析ができません。");
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(text, "text/html");
  const tables = [...document.querySelectorAll("table")];

  for (const table of tables) {
    const headerCells = [...table.querySelectorAll("thead th, tr th")].map((cell) =>
      cell.textContent.trim()
    );
    const hasDate = headerCells.some((textValue) => textValue.includes("日付"));
    const hasNav = headerCells.some((textValue) => textValue.includes("基準価額"));
    if (!hasDate || !hasNav) {
      continue;
    }

    const rows = [...table.querySelectorAll("tbody tr, tr")]
      .map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim()))
      .filter((cells) => cells.length >= 2)
      .map((cells) => ({
        date: normalizeJapaneseDate(cells[0]),
        nav: Number(cells[1].replace(/,/g, "").replace(/[^\d.-]/g, "")),
      }))
      .filter((row) => row.date && Number.isFinite(row.nav) && row.nav > 0)
      .sort((left, right) => left.date.localeCompare(right.date));

    if (rows.length >= 20) {
      return rows;
    }
  }

  const plainText = (document.body?.innerText || document.documentElement?.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n");
  const matches = [...plainText.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*([\d,]+)/g)];
  const rows = matches
    .map((match) => ({
      date: `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`,
      nav: Number(match[4].replace(/,/g, "")),
    }))
    .filter((row) => Number.isFinite(row.nav) && row.nav > 0)
    .sort((left, right) => left.date.localeCompare(right.date));

  if (rows.length >= 20) {
    const unique = new Map();
    rows.forEach((row) => {
      unique.set(row.date, row);
    });
    return [...unique.values()].sort((left, right) => left.date.localeCompare(right.date));
  }

  throw new Error("Yahoo!ファイナンス日本版の時系列HTMLとして解析できませんでした。");
}

function parseUploadedHistory(text, fileName) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".js") || lowerName.endsWith(".json")) {
    return parseOfficialChartData(text);
  }
  if (lowerName.endsWith(".csv")) {
    return parseYahooCsv(text);
  }
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
    return parseYahooJapanHtml(text);
  }
  try {
    return parseOfficialChartData(text);
  } catch (_error) {
    // Fall through.
  }
  try {
    return parseYahooJapanHtml(text);
  } catch (_error) {
    return parseYahooCsv(text);
  }
}

async function readFileAsText(file) {
  const buffer = await file.arrayBuffer();
  const decoders = ["utf-8", "shift_jis", "euc-jp"];

  for (const encoding of decoders) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: encoding === "utf-8" });
      return decoder.decode(buffer);
    } catch (_error) {
      // Try the next candidate encoding.
    }
  }

  return new TextDecoder().decode(buffer);
}

function buildExpectedFileNames(fund) {
  const names = [];
  if (/^\d+$/.test(fund.fundCode) && fund.downloadUrl.includes("chart_data_")) {
    names.push(`chart_data_${fund.fundCode}.js`);
  }
  if (/^\d+$/.test(fund.fundCode)) {
    names.push(`code_${fund.fundCode}.csv`);
  }
  return names;
}

function buildExpectedFileHint(fund) {
  const names = buildExpectedFileNames(fund);
  if (!names.length) {
    return "対応ファイル名が未設定です";
  }
  return `既定候補: ${names.join(" / ")}`;
}

function matchesFundFileName(fileName, fund) {
  const lowerName = fileName.toLowerCase();
  return buildExpectedFileNames(fund).some((expectedName) => lowerName === expectedName.toLowerCase());
}

async function pickDownloadsDirectory() {
  if (typeof window.showDirectoryPicker !== "function") {
    throw new Error(
      "このブラウザはダウンロードフォルダの自動参照に対応していません。必要なファイルを個別に選択してください。"
    );
  }
  return window.showDirectoryPicker({ mode: "read", startIn: "downloads" });
}

async function collectDirectoryFiles(directoryHandle) {
  const files = new Map();
  // eslint-disable-next-line no-restricted-syntax
  for await (const entry of directoryHandle.values()) {
    if (entry.kind === "file") {
      files.set(entry.name, entry);
    }
  }
  return files;
}

async function resolveFundSources() {
  const selectedSources = new Map();
  const missingFunds = [];

  LIVE_FUNDS.forEach((fund, index) => {
    const input = document.getElementById(`fund-file-${index}`);
    const file = input?.files?.[0];
    if (file) {
      selectedSources.set(fund.name, { fund, file, fileName: file.name });
    } else {
      missingFunds.push(fund);
    }
  });

  if (!missingFunds.length) {
    return LIVE_FUNDS.map((fund) => selectedSources.get(fund.name));
  }

  const directoryHandle = await pickDownloadsDirectory();
  const directoryFiles = await collectDirectoryFiles(directoryHandle);
  const unresolved = [];

  for (const fund of missingFunds) {
    const matchedName = [...directoryFiles.keys()].find((fileName) => matchesFundFileName(fileName, fund));
    if (!matchedName) {
      unresolved.push(`${fund.name} (${buildExpectedFileNames(fund).join(" / ")})`);
      continue;
    }
    const handle = directoryFiles.get(matchedName);
    const file = await handle.getFile();
    selectedSources.set(fund.name, { fund, file, fileName: file.name });
  }

  if (unresolved.length) {
    throw new Error(`ダウンロードフォルダに次のファイルがありません: ${unresolved.join("、")}`);
  }

  return LIVE_FUNDS.map((fund) => selectedSources.get(fund.name));
}

async function loadMarketDataFromFiles() {
  const sources = await resolveFundSources();
  const funds = await Promise.all(
    sources.map(async ({ fund, file, fileName }) => {
      const text = await readFileAsText(file);
      return {
        ...fund,
        rows: parseUploadedHistory(text, fileName),
      };
    })
  );

  return calculateMarketData(funds);
}

function buildMonthlySeries(rows) {
  const monthly = new Map();
  rows.forEach((row) => {
    monthly.set(row.date.slice(0, 7), row);
  });
  return [...monthly.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function buildDailySeries(rows) {
  const daily = new Map();
  rows.forEach((row) => {
    daily.set(row.date, row);
  });
  return [...daily.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function buildReturns(closes) {
  const returns = new Map();
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    const current = closes[index];
    returns.set(current.date, current.nav / previous.nav - 1);
  }
  return returns;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values) {
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
}

function sampleCovariance(first, second) {
  const avgFirst = mean(first);
  const avgSecond = mean(second);
  let total = 0;
  for (let index = 0; index < first.length; index += 1) {
    total += (first[index] - avgFirst) * (second[index] - avgSecond);
  }
  return total / (first.length - 1);
}

function buildHistorySets(funds) {
  return funds.map((fund) => ({
    ...fund,
    dailyPrices: buildDailySeries(fund.rows),
    monthlyPrices: buildMonthlySeries(fund.rows),
  }));
}

function selectReturnFrequency(histories) {
  const monthlyReady = histories.every((history) => history.monthlyPrices.length >= 24);
  if (monthlyReady) {
    const monthlyReturns = histories.map((history) => ({
      ...history,
      prices: history.monthlyPrices,
      returns: buildReturns(history.monthlyPrices),
    }));
    const sharedMonthlyDates = [...monthlyReturns[0].returns.keys()].filter((date) =>
      monthlyReturns.every((history) => history.returns.has(date))
    );
    sharedMonthlyDates.sort();
    if (sharedMonthlyDates.length >= 12) {
      return {
        histories: monthlyReturns,
        sharedDates: sharedMonthlyDates,
        frequency: "monthly",
        annualizationFactor: 12,
        minObservationGuide: 12,
        notice: null,
      };
    }
  }

  const dailyReady = histories.every((history) => history.dailyPrices.length >= 15);
  if (dailyReady) {
    const dailyReturns = histories.map((history) => ({
      ...history,
      prices: history.dailyPrices,
      returns: buildReturns(history.dailyPrices),
    }));
    const sharedDailyDates = [...dailyReturns[0].returns.keys()].filter((date) =>
      dailyReturns.every((history) => history.returns.has(date))
    );
    sharedDailyDates.sort();
    if (sharedDailyDates.length >= 15) {
      return {
        histories: dailyReturns,
        sharedDates: sharedDailyDates,
        frequency: "daily",
        annualizationFactor: 252,
        minObservationGuide: 15,
        notice:
          "保存HTMLには直近の時系列しか入っていなかったため、日次リターンの短期データから推計しています。",
      };
    }
  }

  const details = histories
    .map(
      (history) =>
        `${history.name}: 日次${history.dailyPrices.length}件 / 月次${history.monthlyPrices.length}件`
    )
    .join(" / ");
  throw new Error(
    `価格履歴が不足しています。現在の保存ファイルでは ${details} です。単一の保存HTMLには通常20行前後しか入らず、月次計算に必要な期間を満たしません。`
  );
}

function calculateMarketData(funds) {
  const histories = buildHistorySets(funds);
  const selected = selectReturnFrequency(histories);
  const alignedReturns = selected.histories.map((history) =>
    selected.sharedDates.map((date) => history.returns.get(date))
  );
  const monthlyMeans = alignedReturns.map((series) => mean(series));
  const monthlyVariances = alignedReturns.map((series) => sampleVariance(series));
  const monthlyStd = monthlyVariances.map((value) => Math.sqrt(Math.max(value, 0)));

  const covariance = alignedReturns.map((rowSeries) =>
    alignedReturns.map(
      (columnSeries) => sampleCovariance(rowSeries, columnSeries) * selected.annualizationFactor
    )
  );
  const correlation = alignedReturns.map((rowSeries, rowIndex) =>
    alignedReturns.map((columnSeries, columnIndex) => {
      const covarianceValue = sampleCovariance(rowSeries, columnSeries);
      if (monthlyStd[rowIndex] === 0 || monthlyStd[columnIndex] === 0) {
        return 0;
      }
      return covarianceValue / (monthlyStd[rowIndex] * monthlyStd[columnIndex]);
    })
  );

  return {
    source: "三菱UFJアセットマネジメント 公式データ",
    proxyType: "chart_data_<fund_code>.js",
    frequency: selected.frequency,
    periodStart: selected.sharedDates[0],
    periodEnd: selected.sharedDates[selected.sharedDates.length - 1],
    observationCount: selected.sharedDates.length,
    assets: LIVE_FUNDS.map(({ name, fund, fundCode }) => ({ name, fund, fundCode })),
    expectedReturns: monthlyMeans.map((value) => value * selected.annualizationFactor),
    volatility: monthlyStd.map((value) => value * Math.sqrt(selected.annualizationFactor)),
    covariance,
    correlation,
    notice: selected.notice,
  };
}

function collectAssets() {
  return DEFAULT_ASSETS.map((asset, index) => {
    const minimum = Number(document.getElementById(`asset-${index}-min`).value) / 100;
    const maximum = Number(document.getElementById(`asset-${index}-max`).value) / 100;
    return { ...asset, min: minimum, max: maximum };
  });
}

function validateAssets(assets) {
  const totalMin = assets.reduce((sum, asset) => sum + asset.min, 0);
  const totalMax = assets.reduce((sum, asset) => sum + asset.max, 0);

  for (const asset of assets) {
    if (asset.min < 0 || asset.max > 1 || asset.min > asset.max) {
      throw new Error(`${asset.name} の最小値・最大値の設定を見直してください。`);
    }
  }
  if (totalMin > 1) {
    throw new Error("各資産の最小配分合計が100%を超えています。");
  }
  if (totalMax < 1) {
    throw new Error("各資産の最大配分合計が100%未満です。");
  }
}

function sampleWeights(assets, simulations, seed) {
  const random = seededRandom(seed);
  const minima = assets.map((asset) => asset.min);
  const maxima = assets.map((asset) => asset.max);
  const remainingTarget = 1 - minima.reduce((sum, value) => sum + value, 0);
  const accepted = [];

  while (accepted.length < simulations) {
    const trial = assets.map(() => random());
    const trialSum = trial.reduce((sum, value) => sum + value, 0);
    if (trialSum === 0) continue;

    const scaled = minima.map((minimum, index) => minimum + remainingTarget * (trial[index] / trialSum));
    if (scaled.every((value, index) => value <= maxima[index] + 1e-9)) {
      const total = scaled.reduce((sum, value) => sum + value, 0);
      accepted.push(scaled.map((value) => value / total));
      continue;
    }

    const capped = [...minima];
    let remaining = remainingTarget;
    let active = assets.map((_, index) => index);

    while (active.length && remaining > 1e-10) {
      const activeWeights = active.map((index) => trial[index]);
      const activeSum = activeWeights.reduce((sum, value) => sum + value, 0);
      const distributed =
        activeSum === 0
          ? active.map(() => remaining / active.length)
          : activeWeights.map((value) => remaining * (value / activeSum));

      let overflow = false;
      const nextActive = [];
      let nextRemaining = remaining;

      active.forEach((assetIndex, position) => {
        const proposal = capped[assetIndex] + distributed[position];
        if (proposal > maxima[assetIndex] + 1e-9) {
          nextRemaining -= maxima[assetIndex] - capped[assetIndex];
          capped[assetIndex] = maxima[assetIndex];
          overflow = true;
        } else {
          nextActive.push(assetIndex);
        }
      });

      if (!overflow) {
        active.forEach((assetIndex, position) => {
          capped[assetIndex] += distributed[position];
        });
        remaining = 0;
      } else {
        active = nextActive;
        remaining = nextRemaining;
      }
    }

    const sum = capped.reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 1) <= 1e-6 && capped.every((value, index) => value <= maxima[index] + 1e-9)) {
      accepted.push(capped.map((value) => value / sum));
    }
  }

  return accepted;
}

function calculatePortfolioMetrics(weights, expectedReturns, covariance) {
  return weights.map((portfolio) => {
    const expectedReturn = portfolio.reduce(
      (sum, weight, index) => sum + weight * expectedReturns[index],
      0
    );
    let variance = 0;
    for (let row = 0; row < portfolio.length; row += 1) {
      for (let column = 0; column < portfolio.length; column += 1) {
        variance += portfolio[row] * covariance[row][column] * portfolio[column];
      }
    }
    return { expectedReturn, risk: Math.sqrt(Math.max(variance, 0)) };
  });
}

function buildEfficientFrontier(weights, metrics, maxRisk, steps) {
  const tolerances =
    steps <= 1 ? [maxRisk] : Array.from({ length: steps }, (_, index) => (maxRisk * index) / (steps - 1));
  const frontier = [];

  tolerances.forEach((tolerance) => {
    let bestIndex = -1;
    metrics.forEach((metric, index) => {
      if (metric.risk <= tolerance + 1e-9) {
        if (bestIndex === -1 || metric.expectedReturn > metrics[bestIndex].expectedReturn) {
          bestIndex = index;
        }
      }
    });

    if (bestIndex !== -1) {
      frontier.push({
        riskTolerance: tolerance,
        risk: metrics[bestIndex].risk,
        expectedReturn: metrics[bestIndex].expectedReturn,
        weights: weights[bestIndex],
      });
    }
  });

  return frontier;
}

function percent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function buildChartScale(metricsSets, frontierSets, assetPointSets) {
  const risks = metricsSets.flat().map((item) => item.risk);
  const returns = metricsSets.flat().map((item) => item.expectedReturn);
  const frontierRisks = frontierSets.flat().map((item) => item.risk);
  const frontierReturns = frontierSets.flat().map((item) => item.expectedReturn);
  const assetRisks = assetPointSets.flat().map((item) => item.risk);
  const assetReturns = assetPointSets.flat().map((item) => item.expectedReturn);
  const combinedMaxRisk = Math.max(...risks, ...frontierRisks, ...assetRisks, 0.01);
  const combinedMaxReturn = Math.max(...returns, ...frontierReturns, ...assetReturns, 0.01);
  const combinedMinReturn = Math.min(...returns, ...frontierReturns, ...assetReturns, 0);
  return {
    xMax: combinedMaxRisk * 1.06,
    yMin: Math.max(0, combinedMinReturn - (combinedMaxReturn - combinedMinReturn) * 0.08),
    yMax: combinedMaxReturn + (combinedMaxReturn - combinedMinReturn || 0.01) * 0.12,
  };
}

function renderChart(targetElement, metrics, frontier, selectedMaxRisk, assets, marketInputs, sharedScale) {
  const width = 960;
  const height = 560;
  const margin = { top: 42, right: 32, bottom: 70, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const assetPoints = assets.map((asset, index) => ({
    name: asset.name,
    risk: Math.sqrt(Math.max(marketInputs.covariance[index][index], 0)),
    expectedReturn: marketInputs.expectedReturns[index],
  }));
  const { xMax, yMin, yMax } = sharedScale;

  const scaleX = (value) => margin.left + (value / xMax) * plotWidth;
  const scaleY = (value) => height - margin.bottom - ((value - yMin) / (yMax - yMin)) * plotHeight;

  const grid = Array.from({ length: 6 }, (_, index) => {
    const x = margin.left + (plotWidth * index) / 5;
    const y = margin.top + (plotHeight * index) / 5;
    const riskLabel = percent((xMax * index) / 5);
    const returnLabel = percent(yMax - ((yMax - yMin) * index) / 5);
    return `
      <line x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}" stroke="#e8ddd0" stroke-width="1" />
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e8ddd0" stroke-width="1" />
      <text x="${x}" y="${height - margin.bottom + 26}" text-anchor="middle" font-size="13" fill="#5f6c7b">${riskLabel}</text>
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="13" fill="#5f6c7b">${returnLabel}</text>
    `;
  }).join("");

  const dots = metrics
    .map(
      (metric) =>
        `<circle cx="${scaleX(metric.risk).toFixed(2)}" cy="${scaleY(metric.expectedReturn).toFixed(2)}" r="3" fill="#4f7cac" fill-opacity="0.20" />`
    )
    .join("");

  const frontierPoints = frontier
    .map((item) => `${scaleX(item.risk).toFixed(2)},${scaleY(item.expectedReturn).toFixed(2)}`)
    .join(" ");
  const guideX = scaleX(Math.min(selectedMaxRisk, xMax));
  const selectedPoint = frontier.length ? frontier[frontier.length - 1] : null;
  const selectedPointCircle = selectedPoint
    ? `<circle cx="${scaleX(selectedPoint.risk).toFixed(2)}" cy="${scaleY(selectedPoint.expectedReturn).toFixed(2)}" r="6" fill="#bc4b51" stroke="#fffdf9" stroke-width="2" />`
    : "";
  const assetPointPalette = ["#d97706", "#2f855a", "#7c3aed", "#0f766e", "#b45309", "#2563eb"];
  const assetDots = assetPoints
    .map((point, index) => {
      const cx = scaleX(point.risk).toFixed(2);
      const cy = scaleY(point.expectedReturn).toFixed(2);
      const labelOffsetX = index % 2 === 0 ? 10 : -10;
      const anchor = index % 2 === 0 ? "start" : "end";
      return `
        <circle cx="${cx}" cy="${cy}" r="6" fill="${assetPointPalette[index % assetPointPalette.length]}" stroke="#fffdf9" stroke-width="2" />
        <text x="${Number(cx) + labelOffsetX}" y="${Number(cy) - 10}" text-anchor="${anchor}" font-size="12" fill="#1f2933">${point.name}</text>
      `;
    })
    .join("");
  const legendX = margin.left + 20;
  const legendY = margin.top + 18;
  const annotation = selectedPoint
    ? `
      <g>
        <rect x="${legendX}" y="${legendY + 78}" width="248" height="126" rx="16" fill="#fffaf2" stroke="#d8c7ae" />
        <text x="${legendX + 20}" y="${legendY + 106}" font-size="13" font-weight="700" fill="#1f2933">許容リスク ${percent(selectedMaxRisk)}</text>
        <text x="${legendX + 20}" y="${legendY + 126}" font-size="12" fill="#5f6c7b">期待リターン ${percent(selectedPoint.expectedReturn)}</text>
        <text x="${legendX + 20}" y="${legendY + 146}" font-size="12" fill="#5f6c7b">実現リスク ${percent(selectedPoint.risk)}</text>
        ${selectedPoint.weights
          .map(
            (weight, index) =>
              `<text x="${legendX + 20}" y="${legendY + 168 + index * 16}" font-size="12" fill="#1f2933">${assets[index].name} ${percent(weight)}</text>`
          )
          .join("")}
      </g>
    `
    : "";

  targetElement.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="効率的フロンティア グラフ">
      <rect width="${width}" height="${height}" fill="#fffdf9"></rect>
      <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" rx="18" fill="#fff8ef" stroke="#e8ddd0"></rect>
      ${grid}
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#2d3748" stroke-width="2" />
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#2d3748" stroke-width="2" />
      <line x1="${guideX.toFixed(2)}" y1="${margin.top}" x2="${guideX.toFixed(2)}" y2="${height - margin.bottom}" stroke="#2b6f77" stroke-width="2" stroke-dasharray="8 6" />
      ${dots}
      <polyline points="${frontierPoints}" fill="none" stroke="#bc4b51" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${assetDots}
      ${selectedPointCircle}
      ${annotation}
      <text x="${width / 2}" y="${height - 20}" text-anchor="middle" font-size="16" fill="#1f2933">リスク（標準偏差）</text>
      <text x="28" y="${height / 2}" text-anchor="middle" font-size="16" fill="#1f2933" transform="rotate(-90 28 ${height / 2})">期待リターン</text>
      <rect x="${legendX - 10}" y="${legendY - 8}" width="212" height="68" rx="14" fill="#fffaf2" stroke="#d8c7ae" />
      <circle cx="${legendX}" cy="${legendY + 8}" r="5" fill="#4f7cac" fill-opacity="0.4"></circle>
      <text x="${legendX + 14}" y="${legendY + 13}" font-size="13" fill="#5f6c7b">候補ポートフォリオ</text>
      <line x1="${legendX - 2}" y1="${legendY + 32}" x2="${legendX + 28}" y2="${legendY + 32}" stroke="#bc4b51" stroke-width="4"></line>
      <text x="${legendX + 36}" y="${legendY + 37}" font-size="13" fill="#5f6c7b">効率的フロンティア</text>
      <circle cx="${legendX}" cy="${legendY + 56}" r="6" fill="${assetPointPalette[0]}" stroke="#fffdf9" stroke-width="2"></circle>
      <text x="${legendX + 14}" y="${legendY + 61}" font-size="13" fill="#5f6c7b">各資産クラス</text>
    </svg>
  `;
}

function renderMarketMeta(marketData) {
  const proxyLines = marketData.assets
    .map((asset) => `${asset.name}: ${asset.fund} (${asset.fundCode})`)
    .join(" / ");
  const frequencyLabel = marketData.frequency === "daily" ? "日次" : "月次";
  marketMeta.innerHTML = `
    <strong>データソース:</strong> ${marketData.source}<br />
    <strong>取得方式:</strong> ${marketData.proxyType || "direct"}<br />
    <strong>対象期間:</strong> ${marketData.periodStart} から ${marketData.periodEnd} までの${frequencyLabel}リターン（${marketData.observationCount}期間）<br />
    <strong>採用資産:</strong> ${proxyLines}${marketData.notice ? `<br /><strong>注記:</strong> ${marketData.notice}` : ""}
  `;
}

function renderFallbackMeta(errorMessage) {
  const proxyLines = DEFAULT_ASSETS.map((asset) => `${asset.name}: 既定パラメータ`).join(" / ");
  marketMeta.innerHTML = `
    <strong>データソース:</strong> 既定パラメータ<br />
    <strong>状態:</strong> 実データをまだ読み込んでいないため、サンプルの期待リターン・ボラティリティ・相関で描画しています。<br />
    <strong>対象:</strong> ${proxyLines}<br />
    <strong>詳細:</strong> ${errorMessage}
  `;
}

function renderCorrelationTable(marketData) {
  const headerHtml = `
    <tr>
      <th>資産クラス</th>
      ${marketData.assets.map((asset) => `<th>${asset.name}</th>`).join("")}
    </tr>
  `;

  const bodyHtml = marketData.assets
    .map(
      (asset, rowIndex) => `
        <tr>
          <td>${asset.name}</td>
          ${marketData.correlation[rowIndex]
            .map((value) => `<td>${Number(value).toFixed(2)}</td>`)
            .join("")}
        </tr>
      `
    )
    .join("");

  correlationHead.innerHTML = headerHtml;
  correlationBody.innerHTML = bodyHtml;
}

function renderFallbackCorrelationTable() {
  const headerHtml = `
    <tr>
      <th>資産クラス</th>
      ${DEFAULT_ASSETS.map((asset) => `<th>${asset.name}</th>`).join("")}
    </tr>
  `;

  const bodyHtml = DEFAULT_ASSETS.map(
    (asset, rowIndex) => `
      <tr>
        <td>${asset.name}</td>
        ${DEFAULT_CORRELATION[rowIndex].map((value) => `<td>${value.toFixed(2)}</td>`).join("")}
      </tr>
    `
  ).join("");

  correlationHead.innerHTML = headerHtml;
  correlationBody.innerHTML = bodyHtml;
}

function renderBenchmarkCorrelationTable() {
  benchmarkCorrelationHead.innerHTML = `
    <tr>
      <th>資産クラス</th>
      ${BENCHMARK_INDEXES.map((asset) => `<th>${asset.name}</th>`).join("")}
    </tr>
  `;

  benchmarkCorrelationBody.innerHTML = BENCHMARK_INDEXES.map(
    (asset, rowIndex) => `
      <tr>
        <td>${asset.name}</td>
        ${DEFAULT_CORRELATION[rowIndex].map((value) => `<td>${value.toFixed(2)}</td>`).join("")}
      </tr>
    `
  ).join("");
}

function renderBenchmarkReference() {
  benchmarkReference.innerHTML = `
    <p>代表インデックスベースは、実データを外部取得しているわけではなく、アプリ内で定義した代表指数と年率の期待リターン・ボラティリティ・相関前提を使っています。</p>
    <ul>
      ${BENCHMARK_INDEXES.map(
        (asset) =>
          `<li>${asset.name}: ${asset.index} / 期待リターン ${percent(asset.expectedReturn)} / ボラティリティ ${percent(asset.volatility)}</li>`
      ).join("")}
    </ul>
  `;
}

function getActiveMarketInputs() {
  if (state.marketData) {
    return {
      covariance: state.marketData.covariance,
      expectedReturns: state.marketData.expectedReturns,
      source: "live",
    };
  }

  return {
    covariance: buildDefaultCovariance(),
    expectedReturns: DEFAULT_ASSETS.map((asset) => asset.expectedReturn),
    source: "fallback",
  };
}

function getBenchmarkInputs() {
  return {
    covariance: buildBenchmarkCovariance(),
    expectedReturns: BENCHMARK_INDEXES.map((asset) => asset.expectedReturn),
    labels: BENCHMARK_INDEXES.map((asset) => `${asset.name}: ${asset.index}`),
  };
}

async function loadMarketData() {
  message.textContent = "選択したファイルを読み込んでいます...";
  try {
    const marketData = await loadMarketDataFromFiles();
    state.marketData = marketData;
    state.dataMode = "live";
    renderMarketMeta(marketData);
    renderCorrelationTable(marketData);
    renderBenchmarkCorrelationTable();
    message.textContent = marketData.notice
      ? `ファイルを読み込みました。${marketData.notice} 続けてシミュレーションを実行できます。`
      : "ファイルを読み込みました。続けてシミュレーションを実行できます。";
  } catch (error) {
    state.marketData = null;
    state.dataMode = "fallback";
    renderFallbackMeta(error.message);
    renderFallbackCorrelationTable();
    renderBenchmarkCorrelationTable();
    message.textContent = `ファイルを読み込めなかったため、既定パラメータを使います。${error.message}`;
  }
}

async function runSimulation() {
  const assets = collectAssets();
  validateAssets(assets);

  const maxRisk = Number(document.getElementById("max-risk").value) / 100;
  const simulations = Number(document.getElementById("simulations").value);
  const steps = Number(document.getElementById("steps").value);
  const seed = Number(document.getElementById("seed").value);

  if (maxRisk <= 0 || simulations < 1000 || steps < 2 || seed <= 0) {
    throw new Error("最大リスク、シミュレーション回数、刻み数、乱数シードを見直してください。");
  }

  message.textContent = "シミュレーションを実行しています...";
  const marketInputs = getActiveMarketInputs();
  const benchmarkInputs = getBenchmarkInputs();
  const covariance = marketInputs.covariance;
  const expectedReturns = marketInputs.expectedReturns;

  const weights = sampleWeights(assets, simulations, seed);
  const metrics = calculatePortfolioMetrics(weights, expectedReturns, covariance);
  const frontier = buildEfficientFrontier(weights, metrics, maxRisk, steps);
  const benchmarkMetrics = calculatePortfolioMetrics(
    weights,
    benchmarkInputs.expectedReturns,
    benchmarkInputs.covariance
  );
  const benchmarkFrontier = buildEfficientFrontier(weights, benchmarkMetrics, maxRisk, steps);
  const liveAssetPoints = assets.map((asset, index) => ({
    name: asset.name,
    risk: Math.sqrt(Math.max(marketInputs.covariance[index][index], 0)),
    expectedReturn: marketInputs.expectedReturns[index],
  }));
  const benchmarkAssetPoints = assets.map((asset, index) => ({
    name: asset.name,
    risk: Math.sqrt(Math.max(benchmarkInputs.covariance[index][index], 0)),
    expectedReturn: benchmarkInputs.expectedReturns[index],
  }));

  if (!frontier.length) {
    throw new Error("指定条件を満たすポートフォリオが見つかりませんでした。");
  }
  if (!benchmarkFrontier.length) {
    throw new Error("代表インデックス前提で指定条件を満たすポートフォリオが見つかりませんでした。");
  }

  state.frontier = frontier;
  const sharedScale = buildChartScale(
    [metrics, benchmarkMetrics],
    [frontier, benchmarkFrontier],
    [liveAssetPoints, benchmarkAssetPoints]
  );
  renderChart(chart, metrics, frontier, maxRisk, assets, marketInputs, sharedScale);
  renderChart(
    benchmarkChart,
    benchmarkMetrics,
    benchmarkFrontier,
    maxRisk,
    assets,
    benchmarkInputs,
    sharedScale
  );
  if (marketInputs.source === "live") {
    message.textContent = `${simulations.toLocaleString("ja-JP")}件の候補から ${frontier.length} 件の最適配分を抽出しました。`;
  } else {
    message.textContent = `実データを取得できなかったため既定パラメータで表示しています。${simulations.toLocaleString("ja-JP")}件の候補から ${frontier.length} 件の最適配分を抽出しました。`;
  }
}

function renderAssetInputs() {
  assetInputs.innerHTML = DEFAULT_ASSETS.map(
    (asset, index) => `
      <article class="asset-card">
        <h3>${asset.name}</h3>
        <div class="pair-fields">
          <label class="field">
            <span>最小配分</span>
            <div class="input-with-suffix">
              <input id="asset-${index}-min" type="number" min="0" max="100" step="1" value="${asset.min}" />
              <span>%</span>
            </div>
          </label>
          <label class="field">
            <span>最大配分</span>
            <div class="input-with-suffix">
              <input id="asset-${index}-max" type="number" min="0" max="100" step="1" value="${asset.max}" />
              <span>%</span>
            </div>
          </label>
        </div>
      </article>
    `
  ).join("");
}

function renderDownloadInputs() {
  dataDownloads.innerHTML = LIVE_FUNDS.map(
    (fund, index) => `
      <article class="download-card">
        <div class="download-head">
          <strong>${fund.name}</strong>
          <span class="ticker-badge">${fund.fundCode}</span>
        </div>
        <p class="download-meta">${fund.fund}<br />公式の履歴データファイルを保存して選択<br />${buildExpectedFileHint(fund)}</p>
        <div class="download-links">
          <a class="download-link" href="${fund.downloadUrl}" target="_blank" rel="noreferrer">${fund.downloadLabel}</a>
          <input class="file-input" id="fund-file-${index}" type="file" accept=".js,.json,.csv,.html,.htm,text/plain,application/json,text/csv,text/html" />
        </div>
      </article>
    `
  ).join("");
}

function resetForm() {
  form.reset();
  renderDownloadInputs();
  renderAssetInputs();
  document.getElementById("max-risk").value = 15;
  document.getElementById("simulations").value = 20000;
  document.getElementById("steps").value = 12;
  document.getElementById("seed").value = 42;
  state.marketData = null;
  state.dataMode = "fallback";
  renderFallbackMeta("まだデータ取得を実行していません。");
  renderFallbackCorrelationTable();
  runSafely();
}

function runSafely() {
  try {
    const promise = runSimulation();
    if (promise && typeof promise.catch === "function") {
      promise.catch((error) => {
        chart.innerHTML = "";
        benchmarkChart.innerHTML = "";
        marketMeta.innerHTML = "";
        correlationHead.innerHTML = "";
        correlationBody.innerHTML = "";
        benchmarkCorrelationHead.innerHTML = "";
        benchmarkCorrelationBody.innerHTML = "";
        message.textContent = error.message;
      });
    }
  } catch (error) {
    chart.innerHTML = "";
    benchmarkChart.innerHTML = "";
    marketMeta.innerHTML = "";
    correlationHead.innerHTML = "";
    correlationBody.innerHTML = "";
    benchmarkCorrelationHead.innerHTML = "";
    benchmarkCorrelationBody.innerHTML = "";
    message.textContent = error.message;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSafely();
});

fetchDataButton.addEventListener("click", () => {
  loadMarketData();
});

resetButton.addEventListener("click", resetForm);

renderAssetInputs();
renderDownloadInputs();
renderFallbackMeta("まだデータ取得を実行していません。");
renderFallbackCorrelationTable();
renderBenchmarkCorrelationTable();
renderBenchmarkReference();
runSafely();
