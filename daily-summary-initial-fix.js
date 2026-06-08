(() => {
  const SUMMARY_TITLE = "\u9298\u67c4\u30b5\u30de\u30ea\u30fc";
  let stockCache = [];
  let dataLoadStarted = false;

  overrideBaseRenderer();
  startDataLoad();
  startObserver();

  function overrideBaseRenderer() {
    if (typeof window.renderStockSummaryCard !== "function" || window.renderStockSummaryCard.__dailySummaryInitialFix) return;

    const fixedRenderer = function fixedRenderStockSummaryCard(stocks, title) {
      stockCache = Array.isArray(stocks) ? stocks.filter(Boolean) : stockCache;
      return renderDailySummary(title, stockCache);
    };
    fixedRenderer.__dailySummaryInitialFix = true;
    window.renderStockSummaryCard = fixedRenderer;
  }

  function startDataLoad() {
    if (dataLoadStarted) return;
    dataLoadStarted = true;
    loadData()
      .then((payload) => {
        stockCache = Array.isArray(payload?.stocks) ? payload.stocks.filter(Boolean) : [];
        fixVisibleSummary();
      })
      .catch((error) => {
        console.error("daily summary initial fix data load failed", error);
      });
  }

  async function loadData() {
    const config = window.STOCK_DASHBOARD_CONFIG || {};
    const remoteUrl = typeof config.REMOTE_DATA_URL === "string" ? config.REMOTE_DATA_URL.trim() : "";

    if (config.USE_REMOTE_DATA === true && remoteUrl) {
      try {
        const response = await fetch(withTimestamp(remoteUrl), { cache: "no-store" });
        if (response.ok) return await response.json();
      } catch (error) {
        console.error("daily summary initial fix remote fetch failed", error);
      }

      try {
        return await loadJsonp(remoteUrl);
      } catch (error) {
        console.error("daily summary initial fix remote jsonp failed", error);
      }
    }

    const response = await fetch(withTimestamp("data.json"), { cache: "no-store" });
    if (!response.ok) throw new Error(`data.json: ${response.status}`);
    return await response.json();
  }

  function loadJsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `__stockScopeDailySummary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      let finished = false;

      const cleanup = () => {
        delete window[callbackName];
        script.remove();
      };
      const finish = (handler, value) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        cleanup();
        handler(value);
      };

      const timer = window.setTimeout(() => finish(reject, new Error("JSONP timeout")), 10000);
      window[callbackName] = (payload) => finish(resolve, payload);
      script.onerror = () => finish(reject, new Error("JSONP script error"));
      script.src = withParams(url, { callback: callbackName, t: Date.now() });
      document.body.appendChild(script);
    });
  }

  function startObserver() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fixVisibleSummary);
    } else {
      fixVisibleSummary();
    }

    const observer = new MutationObserver(() => fixVisibleSummary());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("click", () => window.setTimeout(fixVisibleSummary, 0), true);
  }

  function fixVisibleSummary() {
    overrideBaseRenderer();
    if (!isOverallDaily()) return;

    const card = findSummaryCard();
    if (!card) return;

    const alreadyFixed = card.querySelector(".summary-row--daily .terminal-daily-values") &&
      !card.querySelector(".stock-row, .brush-summary-row");
    if (alreadyFixed) {
      card.style.visibility = "";
      return;
    }

    const stocks = resolveStocksFromCard(card);
    if (!stocks.length) {
      card.style.visibility = "hidden";
      return;
    }

    card.outerHTML = renderDailySummary(SUMMARY_TITLE, stocks);
  }

  function resolveStocksFromCard(card) {
    const names = Array.from(card.querySelectorAll(".stock-row-title, .brush-summary-row .name, .summary-name"))
      .map((node) => normalize(node.textContent))
      .filter(Boolean);

    if (!names.length) return stockCache;

    const cacheByName = new Map(stockCache.map((stock) => [normalize(stock.name), stock]));
    return names.map((name) => cacheByName.get(name)).filter(Boolean);
  }

  function findSummaryCard() {
    return Array.from(document.querySelectorAll(".card")).find((card) => normalize(card.querySelector("h2")?.textContent) === SUMMARY_TITLE);
  }

  function renderDailySummary(title, stocks) {
    const visibleStocks = Array.isArray(stocks) ? stocks.filter(Boolean) : [];
    return `
      <section class="card summary-card summary-card--daily terminal-summary-card terminal-summary-card--daily" data-daily-summary-initial-fix="1">
        <div class="card-header">
          ${iconBadge()}
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="summary-list summary-list--daily terminal-summary-list" data-summary-visibility-period="daily">
          ${visibleStocks.map(renderStockRow).join("")}
        </div>
      </section>
    `;
  }

  function renderStockRow(stock) {
    const conclusionText = valueText(stock.conclusion || stock.decision || "\u672a\u8a2d\u5b9a");
    const priceText = formatPrice(stock.price);
    const changeText = formatSignedYen(stock.change);
    const rateText = formatPercent(stock.changeRate);
    const tone = changeTone(`${changeText} ${rateText}`);

    return `
      <article class="summary-row summary-row--daily">
        <div class="summary-main">
          <div class="summary-heading-line">
            <strong class="summary-name">${escapeHtml(valueText(stock.name, "---"))}</strong>
            ${renderBadge(conclusionText)}
          </div>
        </div>
        <div class="terminal-daily-values">
          <span class="summary-price">${escapeHtml(priceText)}</span>
          <span class="summary-change is-${tone}">${escapeHtml(changeText)}</span>
          <span class="summary-change is-${tone}">${escapeHtml(rateText)}</span>
        </div>
      </article>
    `;
  }

  function renderBadge(value) {
    if (!hasValue(value)) return "";
    return `<span class="summary-badge is-${badgeTone(value)}">${escapeHtml(value)}</span>`;
  }

  function badgeTone(value) {
    const text = String(value || "");
    if (text.includes("\u8981\u6ce8\u610f") || text.includes("\u65b9\u91dd\u898b\u76f4")) return "danger";
    if (text.includes("\u6ce8\u610f") || text.includes("\u518d\u8a55\u4fa1") || text.includes("\u5229\u78ba")) return "warning";
    if (text.includes("\u653e\u7f6e") || text.includes("\u7d99\u7d9a") || text.includes("\u554f\u984c\u306a\u3057")) return "main";
    return "neutral";
  }

  function formatPrice(value) {
    const text = valueText(value, "---");
    if (text === "---" || text.includes("\u5186")) return text;
    const number = Number(text.replace(/,/g, ""));
    return Number.isFinite(number) ? `${number.toLocaleString("ja-JP")}\u5186` : text;
  }

  function formatSignedYen(value) {
    const text = valueText(value, "---");
    if (text === "---" || text.includes("\u5186")) return text;
    const number = Number(text.replace(/,/g, ""));
    if (!Number.isFinite(number)) return text;
    const sign = number > 0 ? "+" : "";
    return `${sign}${number.toLocaleString("ja-JP")}\u5186`;
  }

  function formatPercent(value) {
    const text = valueText(value, "---");
    if (text === "---" || text.includes("%")) return text;
    const number = Number(text.replace(/,/g, ""));
    if (!Number.isFinite(number)) return text;
    const percent = Math.abs(number) > 0 && Math.abs(number) <= 0.2 ? number * 100 : number;
    const sign = percent > 0 ? "+" : "";
    return `${sign}${percent.toFixed(2)}%`;
  }

  function changeTone(text) {
    if (text.includes("+") || text.includes("\uff0b")) return "up";
    if (text.includes("-") || text.includes("\u2212") || text.includes("\uff0d")) return "down";
    return "flat";
  }

  function isOverallDaily() {
    const scope = document.querySelector(".scope-tabs [aria-selected='true']")?.dataset?.scope || "overall";
    const period = document.querySelector(".period-tabs [aria-selected='true']")?.dataset?.period || "daily";
    return scope === "overall" && period === "daily";
  }

  function iconBadge() {
    const path = '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>';
    return `<span class="icon-badge green"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg></span>`;
  }

  function withTimestamp(url) {
    return withParams(url, { t: Date.now() });
  }

  function withParams(url, params) {
    const query = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
  }

  function valueText(value, fallback = "") {
    return hasValue(value) ? normalize(value) : fallback;
  }

  function hasValue(value) {
    const text = normalize(value);
    return Boolean(text && text !== "---" && text !== "--" && text !== "\u672a\u5165\u529b");
  }

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();