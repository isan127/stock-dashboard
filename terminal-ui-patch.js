(() => {
  const L = {
    summary: "\u9298\u67c4\u30b5\u30de\u30ea\u30fc",
    priceSummary: "\u682a\u4fa1\u30b5\u30de\u30ea\u30fc",
    weeklySummary: "\u9031\u6b21\u30b5\u30de\u30ea\u30fc",
    monthlyEmpty: "\u6708\u6b21\u30c7\u30fc\u30bf\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093",
    match: "\u4e00\u81f4\u5ea6",
    forecastReview: "\u4e88\u60f3\u306e\u632f\u308a\u8fd4\u308a",
    lastUpdate: "LAST UPDATE"
  };

  let terminalData = null;
  let applying = false;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startTerminalUi);
  } else {
    startTerminalUi();
  }

  async function startTerminalUi() {
    document.body.classList.add("terminal-theme");
    setHeader();
    terminalData = await loadTerminalData();
    enhanceTerminalUi();
    document.addEventListener("click", () => {
      schedule(0);
      schedule(120);
      schedule(360);
      schedule(900);
    }, true);

    let ticks = 0;
    const timer = window.setInterval(() => {
      enhanceTerminalUi();
      ticks += 1;
      if (ticks >= 120) window.clearInterval(timer);
    }, 250);

    let pending = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(pending);
      pending = window.setTimeout(enhanceTerminalUi, 40);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function schedule(delay) {
    window.setTimeout(enhanceTerminalUi, delay);
  }

  async function loadTerminalData() {
    const config = window.STOCK_DASHBOARD_CONFIG || {};
    const remoteUrl = typeof config.REMOTE_DATA_URL === "string" ? config.REMOTE_DATA_URL.trim() : "";

    if (config.USE_REMOTE_DATA === true && remoteUrl) {
      try {
        const response = await fetch(addTimestamp(remoteUrl), { cache: "no-store" });
        if (response.ok) return await response.json();
      } catch (error) {
        console.error("terminal ui remote fetch failed", error);
      }

      try {
        return await loadJsonp(remoteUrl);
      } catch (error) {
        console.error("terminal ui remote jsonp failed", error);
      }
    }

    try {
      const response = await fetch(addTimestamp("data.json"), { cache: "no-store" });
      if (response.ok) return await response.json();
    } catch (error) {
      console.error("terminal ui local data load failed", error);
    }

    return null;
  }

  function loadJsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `__stockScopeTerminal_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      let done = false;

      const cleanup = () => {
        delete window[callbackName];
        script.remove();
      };

      const finish = (handler, value) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        cleanup();
        handler(value);
      };

      const timer = window.setTimeout(() => finish(reject, new Error("JSONP timeout")), 10000);
      window[callbackName] = (payload) => finish(resolve, payload);
      script.onerror = () => finish(reject, new Error("JSONP script error"));
      script.src = addParams(url, { callback: callbackName, t: Date.now() });
      document.body.appendChild(script);
    });
  }

  function enhanceTerminalUi() {
    if (applying) return;
    setHeader();
    normalizeTabs();
    if (!terminalData) return;

    const scope = selectedScope();
    const period = selectedPeriod();
    const content = document.getElementById("content");
    if (period !== "monthly" && content) delete content.dataset.terminalMonthlyEmpty;

    if (period === "monthly" && !monthlyReviews().length) {
      renderMonthlyEmpty();
      return;
    }

    if (scope === "overall") patchOverallSummary(period);

    if (scope === "individual") {
      if (period === "daily") patchIndividualDailyPrice();
      if (period === "weekly") patchIndividualWeekly();
    }

    patchReflectionCard();
  }

  function setHeader() {
    const title = document.getElementById("dashboardTitle");
    if (title) title.textContent = "StockScope";

    const mode = document.getElementById("dashboardMode");
    if (mode) mode.textContent = "";

    const dateCard = document.querySelector(".date-card");
    if (dateCard && dateCard.dataset.terminalHeader !== "1") {
      dateCard.innerHTML = `<span>${L.lastUpdate}</span><strong>${formatNow()}</strong>`;
      dateCard.dataset.terminalHeader = "1";
    } else {
      const strong = dateCard?.querySelector("strong");
      if (strong) strong.textContent = formatNow();
    }
  }

  function normalizeTabs() {
    const labels = {
      overall: "\u5168\u4f53",
      individual: "\u500b\u5225",
      daily: "\u65e5\u6b21",
      weekly: "\u9031\u6b21",
      monthly: "\u6708\u6b21"
    };
    document.querySelectorAll("[data-scope], [data-period]").forEach((button) => {
      const key = button.dataset.scope || button.dataset.period;
      if (labels[key]) button.textContent = labels[key];
    });
  }

  function patchOverallSummary(period) {
    const card = findCardByTitle(L.summary);
    if (!card || card.dataset.terminalPeriod === period) return;

    const stocks = getStocks();
    const rows = period === "weekly"
      ? renderWeeklyMiniCards(stocks)
      : period === "monthly"
        ? renderMonthlyMiniCards()
        : renderDailyMiniCards(stocks);

    if (!rows) return;

    applying = true;
    card.classList.add("terminal-summary-card", `terminal-summary-card--${period}`);
    const source = card.querySelector(".summary-list, .brush-summary-list, .compact-summary");
    if (source) {
      source.outerHTML = rows;
    } else {
      card.insertAdjacentHTML("beforeend", rows);
    }
    card.dataset.terminalPeriod = period;
    applying = false;
  }

  function renderDailyMiniCards(stocks) {
    if (!stocks.length) return "";
    return `
      <div class="summary-list summary-list--daily terminal-summary-list">
        ${stocks.map((stock) => {
          const change = readStock(stock, ["change", "\u524d\u65e5\u6bd4"], "");
          const changeRate = readStock(stock, ["changeRate", "\u524d\u65e5\u6bd4\u7387"], "");
          const tone = getChangeTone(`${change} ${changeRate}`);
          return `
            <article class="summary-row summary-row--daily">
              <div class="summary-main">
                <div class="summary-heading-line">
                  <strong class="summary-name">${escapeHtml(valueOrDash(stock.name))}</strong>
                  ${renderBadge(conclusion(stock), conclusionTone(conclusion(stock)))}
                </div>
              </div>
              <div class="terminal-daily-values">
                <span class="summary-price">${escapeHtml(valueOrDash(readStock(stock, ["price", "\u682a\u4fa1"], "")))}</span>
                <span class="summary-change is-${tone}">${escapeHtml(valueOrDash(change))}</span>
                <span class="summary-change is-${tone}">${escapeHtml(valueOrDash(changeRate))}</span>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderWeeklyMiniCards(stocks) {
    const reviews = weeklyReviews();
    if (!reviews.length) {
      return `<div class="terminal-mini-grid"><p class="empty-note">\u9031\u6b21\u30ec\u30d3\u30e5\u30fc\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093</p></div>`;
    }

    return `
      <div class="terminal-mini-grid">
        ${stocks.map((stock) => {
          const review = weeklyReviewFor(stock);
          const actualMove = review ? read(review, ["actualMove", "weeklyResult", "\u5b9f\u969b\u306e\u5024\u52d5\u304d"], "---") : "---";
          const matchLevel = review ? read(review, ["matchLevel", "\u4e00\u81f4\u5ea6"], "---") : "---";
          const policy = review ? read(review, ["provisionalNextPolicy", "nextWeekPolicy", "\u6765\u9031\u306b\u5411\u3051\u305f\u66ab\u5b9a\u65b9\u91dd"], conclusion(stock)) : conclusion(stock);
          return `
            <article class="terminal-mini-card">
              <div class="terminal-mini-head">
                <strong>${escapeHtml(valueOrDash(stock.name))}</strong>
                ${renderBadge(valueOrDash(matchLevel), matchTone(matchLevel))}
              </div>
              <p class="terminal-mini-text">${escapeHtml(valueOrDash(actualMove))}</p>
              <div class="terminal-mini-footer">
                ${renderBadge(shortDecision(policy), conclusionTone(policy))}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderMonthlyMiniCards() {
    const reviews = monthlyReviews();
    if (!reviews.length) {
      return `<div class="terminal-mini-grid"><p class="empty-note">${L.monthlyEmpty}</p></div>`;
    }

    return `
      <div class="terminal-mini-grid">
        ${reviews.map((review) => {
          const name = read(review, ["name", "stockName", "\u9298\u67c4\u540d"], "---");
          const change = read(review, ["monthlyMove", "\u6708\u9593\u5909\u5316", "\u6708\u9593\u306e\u5024\u52d5\u304d"], "---");
          const trend = read(review, ["monthlyTrend", "\u6708\u9593\u50be\u5411"], "");
          const policy = read(review, ["nextMonthPolicy", "\u6765\u6708\u65b9\u91dd", "\u7fcc\u6708\u65b9\u91dd"], "---");
          return `
            <article class="terminal-mini-card">
              <div class="terminal-mini-head">
                <strong>${escapeHtml(valueOrDash(name))}</strong>
                ${renderBadge(shortDecision(policy), conclusionTone(policy))}
              </div>
              <p class="terminal-mini-text">${escapeHtml(valueOrDash(change))}</p>
              ${hasValue(trend) ? `<p class="terminal-mini-text">${escapeHtml(trend)}</p>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function patchIndividualDailyPrice() {
    const card = findCardByTitle(L.priceSummary);
    const stock = currentStock();
    if (!card || !stock || card.dataset.terminalPriceCode === String(stock.code || stock.name || "")) return;

    const change = readStock(stock, ["change", "\u524d\u65e5\u6bd4"], "");
    const changeRate = readStock(stock, ["changeRate", "\u524d\u65e5\u6bd4\u7387"], "");
    const tone = getChangeTone(`${change} ${changeRate}`);
    const html = `
      <div class="terminal-price-summary">
        <div>
          <span class="terminal-price-label">\u682a\u4fa1</span>
          <strong class="terminal-price-value">${escapeHtml(valueOrDash(readStock(stock, ["price", "\u682a\u4fa1"], "")))}</strong>
        </div>
        <div class="terminal-change-stack">
          <span class="terminal-change-label">\u524d\u65e5\u6bd4</span>
          <strong class="terminal-change-value is-${tone}">${escapeHtml(valueOrDash(change))}</strong>
          <strong class="terminal-change-value is-${tone}">${escapeHtml(valueOrDash(changeRate))}</strong>
        </div>
      </div>
    `;

    applying = true;
    card.querySelector(".metric-grid")?.remove();
    card.querySelector(".terminal-price-summary")?.remove();
    card.insertAdjacentHTML("beforeend", html);
    card.dataset.terminalPriceCode = String(stock.code || stock.name || "");
    applying = false;
  }

  function patchIndividualWeekly() {
    const summaryCard = findCardByTitle(L.weeklySummary);
    if (summaryCard && summaryCard.dataset.terminalWeeklyClean !== "1") {
      summaryCard.querySelectorAll(".metric").forEach((metric) => {
        const label = normalize(metric.querySelector("span")?.textContent);
        if (label === L.match) metric.remove();
      });
      summaryCard.dataset.terminalWeeklyClean = "1";
    }
  }

  function patchReflectionCard() {
    const card = findCardByTitle(L.forecastReview);
    if (!card || card.dataset.terminalReflection === "1") return;
    card.dataset.terminalReflection = "1";
    card.classList.add("terminal-reflection-card");
  }

  function renderMonthlyEmpty() {
    const content = document.getElementById("content");
    if (!content || content.dataset.terminalMonthlyEmpty === "1") return;

    applying = true;
    content.innerHTML = `
      <section class="card terminal-empty-card">
        <div class="card-header">
          ${iconBadge("calendarMonth", "green")}
          <h2>${L.monthlyEmpty}</h2>
        </div>
        <p class="empty-note">\u6708\u6b21\u30ed\u30b0\u304c\u5165\u308b\u307e\u3067\u306f\u3001\u65e5\u6b21\u30fb\u9031\u6b21\u30c7\u30fc\u30bf\u3092\u7121\u7406\u306b\u6708\u6b21\u6271\u3044\u3057\u307e\u305b\u3093\u3002</p>
      </section>
    `;
    content.dataset.terminalMonthlyEmpty = "1";
    applying = false;
  }

  function findCardByTitle(title) {
    return Array.from(document.querySelectorAll(".card")).find((card) => normalize(card.querySelector("h2")?.textContent) === title);
  }

  function selectedScope() {
    return document.querySelector(".scope-tabs [aria-selected='true']")?.dataset?.scope || "overall";
  }

  function selectedPeriod() {
    return document.querySelector(".period-tabs [aria-selected='true']")?.dataset?.period || "daily";
  }

  function selectedStockCode() {
    return document.querySelector(".stock-tabs [aria-selected='true']")?.dataset?.stock || "";
  }

  function currentStock() {
    const code = selectedStockCode();
    const stocks = getStocks();
    return stocks.find((stock) => String(stock.code) === String(code)) || stocks[0] || null;
  }

  function getStocks() {
    return Array.isArray(terminalData?.stocks) ? terminalData.stocks : [];
  }

  function weeklyReviews() {
    const reviews = Array.isArray(terminalData?.weeklyReviews)
      ? terminalData.weeklyReviews
      : Array.isArray(terminalData?.weeklyReview)
        ? terminalData.weeklyReview
        : terminalData?.weeklyReview
          ? [terminalData.weeklyReview]
          : [];
    return reviews.filter(Boolean);
  }

  function monthlyReviews() {
    const reviews = Array.isArray(terminalData?.monthlyReviews)
      ? terminalData.monthlyReviews
      : Array.isArray(terminalData?.monthlyReview)
        ? terminalData.monthlyReview
        : terminalData?.monthlyReview
          ? [terminalData.monthlyReview]
          : [];
    return reviews.filter((review) => review && Object.values(review).some(hasValue));
  }

  function weeklyReviewFor(stock) {
    return weeklyReviews().find((review) => matchesStock(review, stock));
  }

  function matchesStock(review, stock) {
    const reviewCode = read(review, ["code", "\u8a3c\u5238\u30b3\u30fc\u30c9"], "");
    const reviewName = read(review, ["name", "stockName", "\u9298\u67c4\u540d"], "");
    return (hasValue(reviewCode) && String(reviewCode) === String(stock.code))
      || (hasValue(reviewName) && String(reviewName) === String(stock.name));
  }

  function readStock(stock, keys, fallback = "") {
    return read(stock, keys, fallback);
  }

  function read(source, keys, fallback = "") {
    if (!source) return fallback;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key) && hasValue(source[key])) return source[key];
    }
    return fallback;
  }

  function conclusion(stock) {
    return read(stock, ["conclusion", "\u7d50\u8ad6"], "\u672a\u8a2d\u5b9a");
  }

  function renderBadge(text, tone) {
    if (!hasValue(text)) return "";
    return `<span class="summary-badge is-${tone}">${escapeHtml(String(text))}</span>`;
  }

  function shortDecision(value) {
    const text = valueOrDash(value);
    return text.split(/[:\uff1a\u3002]/)[0].trim() || text;
  }

  function getChangeTone(value) {
    const text = String(value || "");
    if (text.includes("+") || text.includes("\uff0b")) return "up";
    if (text.includes("-") || text.includes("\u2212") || text.includes("\uff0d")) return "down";
    return "flat";
  }

  function conclusionTone(value) {
    const text = String(value || "");
    if (text.includes("\u8981\u6ce8\u610f") || text.includes("\u65b9\u91dd\u898b\u76f4")) return "danger";
    if (text.includes("\u6ce8\u610f") || text.includes("\u5229\u78ba") || text.includes("\u8b66\u6212")) return "warning";
    if (text.includes("\u653e\u7f6e") || text.includes("\u7d99\u7d9a") || text.includes("\u554f\u984c\u306a\u3057")) return "main";
    return "neutral";
  }

  function matchTone(value) {
    const text = String(value || "");
    if (text.includes("\u9ad8")) return "main";
    if (text.includes("\u4e2d")) return "warning";
    if (text.includes("\u4f4e")) return "danger";
    return "neutral";
  }

  function iconBadge(name, tone = "green") {
    const icons = window.STOCK_SCOPE_ICONS || {};
    const svg = icons[name] || icons.calendarMonth || icons.info || "";
    return `<span class="icon-badge ${tone}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${svg}</svg></span>`;
  }

  function addTimestamp(url) {
    return addParams(url, { t: Date.now() });
  }

  function addParams(url, params) {
    const query = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
  }

  function formatNow() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  function valueOrDash(value) {
    return hasValue(value) ? normalize(value) : "---";
  }

  function normalize(value) {
    return String(value ?? "").replace(/\u3000/g, " ").trim();
  }

  function hasValue(value) {
    return value !== null && value !== undefined && normalize(value) !== "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
