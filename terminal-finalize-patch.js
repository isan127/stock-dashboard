(() => {
  const L = {
    summary: "\u9298\u67c4\u30b5\u30de\u30ea\u30fc",
    weeklyReviewEmpty: "\u9031\u6b21\u30ec\u30d3\u30e5\u30fc\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093",
    match: "\u4e00\u81f4\u5ea6"
  };

  let data = null;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  async function start() {
    data = await loadData();
    apply();
    document.addEventListener("click", () => {
      window.setTimeout(apply, 80);
      window.setTimeout(apply, 420);
      window.setTimeout(apply, 1000);
    }, true);

    let ticks = 0;
    const timer = window.setInterval(() => {
      apply();
      ticks += 1;
      if (ticks >= 80) window.clearInterval(timer);
    }, 300);
  }

  async function loadData() {
    const config = window.STOCK_DASHBOARD_CONFIG || {};
    const remoteUrl = typeof config.REMOTE_DATA_URL === "string" ? config.REMOTE_DATA_URL.trim() : "";

    if (config.USE_REMOTE_DATA === true && remoteUrl) {
      try {
        const response = await fetch(addTimestamp(remoteUrl), { cache: "no-store" });
        if (response.ok) return await response.json();
      } catch (error) {
        console.error("terminal finalize remote fetch failed", error);
      }
      try {
        return await loadJsonp(remoteUrl);
      } catch (error) {
        console.error("terminal finalize remote jsonp failed", error);
      }
    }

    try {
      const response = await fetch(addTimestamp("data.json"), { cache: "no-store" });
      if (response.ok) return await response.json();
    } catch (error) {
      console.error("terminal finalize local data failed", error);
    }

    return null;
  }

  function loadJsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `__stockScopeTerminalFinal_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

  function apply() {
    if (!data) return;
    if (selectedScope() === "overall" && selectedPeriod() === "weekly") patchOverallWeekly();
    if (selectedScope() === "individual" && selectedPeriod() === "weekly") removeDuplicateMatch();
  }

  function patchOverallWeekly() {
    const card = findCardByTitle(L.summary);
    if (!card) return;
    const existing = card.querySelector(".terminal-mini-grid");
    if (existing?.dataset.finalizedWeekly === "1") return;

    const stocks = Array.isArray(data.stocks) ? data.stocks : [];
    const reviews = weeklyReviews();
    const html = reviews.length ? stocks.map((stock) => {
      const review = weeklyReviewFor(stock);
      const actualMove = review ? read(review, ["actualMove", "weeklyResult", "\u5b9f\u969b\u306e\u5024\u52d5\u304d"], "---") : "---";
      const matchLevel = review ? read(review, ["matchLevel", "\u4e00\u81f4\u5ea6"], "---") : "---";
      const policy = review ? read(review, ["provisionalNextPolicy", "nextWeekPolicy", "\u6765\u9031\u306b\u5411\u3051\u305f\u66ab\u5b9a\u65b9\u91dd"], conclusion(stock)) : conclusion(stock);
      return `
        <article class="terminal-mini-card">
          <div class="terminal-mini-head">
            <strong>${escapeHtml(valueOrDash(stock.name))}</strong>
            ${badge(valueOrDash(matchLevel), matchTone(matchLevel))}
          </div>
          <p class="terminal-mini-text">${escapeHtml(valueOrDash(actualMove))}</p>
          <div class="terminal-mini-footer">${badge(shortDecision(policy), conclusionTone(policy))}</div>
        </article>
      `;
    }).join("") : `<p class="empty-note">${L.weeklyReviewEmpty}</p>`;

    const replacement = `<div class="terminal-mini-grid" data-finalized-weekly="1">${html}</div>`;
    if (existing) existing.outerHTML = replacement;
    else card.insertAdjacentHTML("beforeend", replacement);
  }

  function removeDuplicateMatch() {
    const card = findCardByTitle("\u9031\u6b21\u30b5\u30de\u30ea\u30fc");
    if (!card) return;
    card.querySelectorAll(".metric").forEach((metric) => {
      const label = normalize(metric.querySelector("span")?.textContent);
      if (label === L.match) metric.remove();
    });
  }

  function weeklyReviews() {
    const reviews = Array.isArray(data?.weeklyReviews)
      ? data.weeklyReviews
      : Array.isArray(data?.weeklyReview)
        ? data.weeklyReview
        : data?.weeklyReview
          ? [data.weeklyReview]
          : [];
    return reviews.filter(Boolean);
  }

  function weeklyReviewFor(stock) {
    return weeklyReviews().find((review) => matchesStock(review, stock));
  }

  function matchesStock(review, stock) {
    const reviewCode = normalizeCode(read(review, ["code", "\u8a3c\u5238\u30b3\u30fc\u30c9"], ""));
    const stockCode = normalizeCode(stock.code);
    const reviewName = normalizeName(read(review, ["name", "stockName", "\u9298\u67c4\u540d"], ""));
    const stockName = normalizeName(stock.name);
    return (reviewCode && stockCode && reviewCode === stockCode)
      || (reviewCode && stockCode && (reviewCode.includes(stockCode) || stockCode.includes(reviewCode)))
      || (reviewName && stockName && reviewName === stockName);
  }

  function findCardByTitle(title) {
    return Array.from(document.querySelectorAll(".card")).find((card) => normalize(card.querySelector("h2")?.textContent) === title);
  }

  function selectedScope() {
    return document.querySelector(".scope-tabs [aria-selected='true']")?.dataset?.scope || "";
  }

  function selectedPeriod() {
    return document.querySelector(".period-tabs [aria-selected='true']")?.dataset?.period || "";
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

  function badge(text, tone) {
    if (!hasValue(text)) return "";
    return `<span class="summary-badge is-${tone}">${escapeHtml(String(text))}</span>`;
  }

  function shortDecision(value) {
    const text = valueOrDash(value);
    return text.split(/[:\uff1a\u3002]/)[0].trim() || text;
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

  function normalizeCode(value) {
    return normalize(value).replace(/\.0$/, "").replace(/[^\dA-Za-z]/g, "");
  }

  function normalizeName(value) {
    return normalize(value).replace(/\s+/g, "");
  }

  function addTimestamp(url) {
    return addParams(url, { t: Date.now() });
  }

  function addParams(url, params) {
    const query = Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
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
