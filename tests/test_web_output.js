const fs = require("fs");
const vm = require("vm");

class FakeElement {
  constructor(id = "", tagName = "div") {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
    this.listeners = {};
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  click() {}
}

function buildContext() {
  const ids = [
    "asset-inputs",
    "simulator-form",
    "message",
    "chart",
    "benchmark-chart",
    "market-meta",
    "correlation-head",
    "correlation-body",
    "benchmark-correlation-head",
    "benchmark-correlation-body",
    "reset-button",
    "max-risk",
    "simulations",
    "steps",
    "seed",
  ];

  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  elements.get("max-risk").value = "18";
  elements.get("simulations").value = "5000";
  elements.get("steps").value = "8";
  elements.get("seed").value = "42";

  for (let index = 0; index < 6; index += 1) {
    elements.set(`asset-${index}-min`, new FakeElement(`asset-${index}-min`));
    elements.set(`asset-${index}-max`, new FakeElement(`asset-${index}-max`));
  }
  elements.get("asset-0-min").value = "10";
  elements.get("asset-0-max").value = "50";
  elements.get("asset-1-min").value = "0";
  elements.get("asset-1-max").value = "60";
  elements.get("asset-2-min").value = "10";
  elements.get("asset-2-max").value = "60";
  elements.get("asset-3-min").value = "0";
  elements.get("asset-3-max").value = "50";
  elements.get("asset-4-min").value = "0";
  elements.get("asset-4-max").value = "30";
  elements.get("asset-5-min").value = "0";
  elements.get("asset-5-max").value = "30";

  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, new FakeElement(id));
      }
      return elements.get(id);
    },
    createElement(tagName) {
      return new FakeElement("", tagName);
    },
  };

  const context = {
    console,
    document,
    Blob: class Blob {
      constructor(parts) {
        this.parts = parts;
      }
    },
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {},
    },
    fetch: async () => ({
      ok: false,
      json: async () => ({ error: "test fallback" }),
    }),
    setTimeout,
    clearTimeout,
  };

  return { context, elements };
}

async function main() {
  const source = fs.readFileSync("/Users/yskmjp/Documents/codex/portfolio-simulator/web/app.js", "utf8");
  const { context, elements } = buildContext();
  vm.createContext(context);
  vm.runInContext(source, context);

  await context.runSimulation();

  const chartHtml = elements.get("chart").innerHTML;
  const benchmarkChartHtml = elements.get("benchmark-chart").innerHTML;
  const correlationBody = elements.get("correlation-body").innerHTML;
  const benchmarkCorrelationBody = elements.get("benchmark-correlation-body").innerHTML;

  if (!chartHtml.includes("<svg") || !chartHtml.includes("<polyline")) {
    throw new Error("グラフSVGが生成されていません。");
  }
  if (!benchmarkChartHtml.includes("<svg") || !benchmarkChartHtml.includes("<polyline")) {
    throw new Error("比較用グラフSVGが生成されていません。");
  }
  if (!correlationBody.includes("<tr>")) {
    throw new Error("相関テーブルが生成されていません。");
  }
  if (!benchmarkCorrelationBody.includes("<tr>")) {
    throw new Error("比較用相関テーブルが生成されていません。");
  }

  console.log("chart_svg:", chartHtml.includes("<svg"));
  console.log("benchmark_chart_svg:", benchmarkChartHtml.includes("<svg"));
  console.log("frontier_line:", chartHtml.includes("<polyline"));
  console.log("correlation_rows:", (correlationBody.match(/<tr>/g) || []).length);
  console.log("benchmark_correlation_rows:", (benchmarkCorrelationBody.match(/<tr>/g) || []).length);
  console.log("message:", elements.get("message").textContent);
  console.log("market_meta:", elements.get("market-meta").innerHTML.replace(/\s+/g, " ").trim());
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
