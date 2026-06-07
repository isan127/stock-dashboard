(() => {
  let data = null;
  let applying = false;

  injectStyles();
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    data = await loadData();
    document.addEventListener("click", () => window.setTimeout(apply, 0));
    window.setTimeout(apply, 1400);
  }

  async function loadData() {
    const config = window.STOCK_DASHBOARD_CONFIG || {};
    const remoteUrl = typeof config.REMOTE_DATA_URL === "string" ? config.REMOTE_DATA_URL.trim() : "";
    const urls = config.USE_REMOTE_DATA === true && remoteUrl ? [remoteUrl, "data.json"] : ["data.json"];
    for (const url of urls) {
      try {
        const response = await fetch(addTimestamp(url), { cache: "no-store" });
        if (response.ok) return await response.json();
      } catch (error) {
        console.error("individual ui patch data load failed", url, error);
      }
    }
    return null;
  }

  function apply() {
    if (!data || applying) return;
    const scope = document.querySelector(".scope-tabs [aria-selected='true']")?.dataset?.scope;
    const period = document.querySelector(".period-tabs [aria-selected='true']")?.dataset?.period;
    if (scope !== "individual" || !["weekly", "monthly"].includes(period)) return;

    const stockCode = document.querySelector(".stock-tabs [aria-selected='true']")?.dataset?.stock;
    const stocks = Array.isArray(data.stocks) ? data.stocks.filter(Boolean) : [];
    const stock = stocks.find((item) => String(item.code) === String(stockCode)) || stocks[0];
    const content = document.getElementById("content");
    if (!stock || !content) return;

    applying = true;
    content.innerHTML = period === "weekly" ? renderWeekly(stock) : renderMonthly(stock);
    content.dataset.individualUiPatch = period;
    applying = false;
  }

  function renderWeekly(stock) {
    const review = weeklyReviewFor(stock);
    if (!review) {
      return [
        stockHeader(stock, "週次レビュー"),
        emptyCard("週次レビューはまだありません")
      ].join("");
    }

    const policy = value(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], conclusion(stock));
    const matchLevel = value(review, ["matchLevel", "一致度"], "");
    const actionText = weeklyAction(review);
    const forecastRange = value(review, ["forecastRange", "想定レンジ"], "") || rangeText(value(review, ["forecastRangeLow", "想定レンジ下限"], ""), value(review, ["forecastRangeHigh", "想定レンジ上限"], ""));
    const actualRange = value(review, ["actualRange", "実際レンジ"], "") || rangeText(value(review, ["actualRangeLow", "実際レンジ下限"], ""), value(review, ["actualRangeHigh", "実際レンジ上限"], ""));

    return [
      stockHeader(stock, "週次レビュー", matchLevel ? [`一致度：${matchLevel}`] : []),
      infoCard("現在の結論", policy),
      heroCard("対応の必要性", actionText, "", toneForAction(actionText)),
      metricCard("週次サマリー", [
        ["週", value(review, ["week", "週"], "")],
        ["想定レンジ", forecastRange],
        ["実際レンジ", actualRange],
        ["一致度", matchLevel]
      ]),
      infoCard("実際の値動き", value(review, ["actualMove", "weeklyResult", "実際の値動き"], "")),
      matchLevel ? heroCard("一致度", matchLevel, "", toneForMatch(matchLevel)) : "",
      listOrTextCard("当たった点", value(review, ["matchedPoints", "hitPoints", "当たった点"], ""), "green"),
      listOrTextCard("外れた点", value(review, ["missedPoints", "外れた点"], ""), "red"),
      listOrTextCard("次回に活かす点", value(review, ["nextImprovement", "nextImprovePoints", "次回に活かす点"], ""), "green"),
      heroCard("来週に向けた暫定方針", policy, "", "orange")
    ].filter(Boolean).join("");
  }

  function renderMonthly(stock) {
    const review = monthlyReviewFor(stock);
    if (!review) {
      return [
        stockHeader(stock, "月次評価"),
        emptyCard("月次データはまだありません", "月次レビュー用データを作成すると、ここに月間サマリーと来月方針が表示されます")
      ].join("");
    }

    const conclusionText = value(review, ["monthlyConclusion", "conclusion", "月次結論", "結論"], value(review, ["nextMonthPolicy", "来月方針", "翌月方針"], ""));
    const actionText = value(review, ["actionRequired", "needAction", "monthlyAction", "対応の必要性"], "様子見");
    const monthlyRange = value(review, ["monthlyRange", "月間レンジ"], "") || rangeText(value(review, ["monthlyRangeLow", "月間レンジ下限"], ""), value(review, ["monthlyRangeHigh", "月間レンジ上限"], ""));
    const strongItems = list(value(review, ["strongMaterials", "positiveFactors", "強材料"], ""));
    const weakItems = list(value(review, ["weakMaterials", "negativeFactors", "weakFactors", "弱材料", "注意材料"], ""));
    const watchPoints = list(value(review, ["watchPoints", "nextMonthWatchPoints", "来月見るポイント"], ""));
    const triggers = list(value(review, ["policyTriggers", "triggers", "方針変更トリガー"], ""));
    const nextPolicy = value(review, ["nextMonthPolicy", "来月方針", "翌月方針"], "");

    return [
      stockHeader(stock, "月次評価"),
      infoCard("現在の結論", conclusionText || nextPolicy),
      heroCard("対応の必要性", actionText, "", toneForAction(actionText)),
      metricCard("月間サマリー", [
        ["月間の値動き", value(review, ["monthlyMove", "月間の値動き"], "")],
        ["月間傾向", value(review, ["monthlyTrend", "月間傾向"], "")],
        ["月間変化率", value(review, ["monthlyChangeRate", "月間変化率"], "")],
        ["月間レンジ", monthlyRange]
      ]),
      listOrTextCard("月間の主な理由", value(review, ["monthlyReasons", "mainReasons", "月間の主な理由"], ""), "green"),
      strongItems.length || weakItems.length ? materialCard(strongItems, weakItems) : "",
      watchPoints.length ? tagCard("来月見るポイント", watchPoints, "green") : "",
      triggers.length ? tagCard("方針変更トリガー", triggers, "orange") : "",
      nextPolicy ? heroCard("来月方針", nextPolicy, "", "orange") : ""
    ].filter(Boolean).join("");
  }

  function stockHeader(stock, label, chips = []) {
    const chipItems = [label, ...chips].filter(hasValue);
    return `
      <section class="card hero-card">
        <div class="card-header individual-stock-header">
          <div>
            <h2>${escapeHtml(stock.name || "銘柄")} <span class="label">${escapeHtml(stock.code || "--")}</span></h2>
          </div>
          <div class="chip-row individual-header-chips">
            ${chipItems.map((chip) => chipEl(chip, chip.includes("低") || chip.includes("要注意") ? "red" : "green")).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function heroCard(title, result, body = "", tone = "green") {
    return `
      <section class="card hero-card">
        <div class="card-header">
          ${badge(tone)}
          <div>
            <h2>${escapeHtml(title)}</h2>
            <p class="hero-result">${escapeHtml(text(result, "未設定"))}</p>
          </div>
        </div>
        ${hasValue(body) ? `<p class="lead">${escapeHtml(body)}</p>` : ""}
      </section>
    `;
  }

  function infoCard(title, body) {
    if (!hasValue(body)) return "";
    return `
      <section class="card">
        <div class="card-header">
          ${badge("green")}
          <h2>${escapeHtml(title)}</h2>
        </div>
        <p class="compact-text">${escapeHtml(body)}</p>
      </section>
    `;
  }

  function metricCard(title, rows) {
    const filtered = rows.filter(([, item]) => hasValue(item));
    if (!filtered.length) return "";
    return `
      <section class="card">
        <div class="card-header">
          ${badge("green")}
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="metric-grid">
          ${filtered.map(([label, item]) => `
            <div class="metric">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(String(item))}</strong>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function listOrTextCard(title, raw, tone = "green") {
    const items = list(raw);
    if (!items.length) return "";
    return items.length === 1 ? infoCard(title, items[0]) : tagCard(title, items, tone);
  }

  function tagCard(title, items, tone = "green") {
    const normalized = list(items);
    if (!normalized.length) return "";
    return `
      <section class="card">
        <div class="card-header">
          ${badge(tone)}
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="tag-list">${normalized.map((item) => `<span class="tag ${tone}">${escapeHtml(item)}</span>`).join("")}</div>
      </section>
    `;
  }

  function materialCard(strongItems, weakItems) {
    return `
      <section class="card">
        <div class="card-header">
          ${badge("green")}
          <h2>強弱材料</h2>
        </div>
        <div class="individual-material-grid">
          ${strongItems.length ? `<div class="individual-material-column"><h3>強材料</h3><div class="tag-list">${strongItems.map((item) => `<span class="tag green">${escapeHtml(item)}</span>`).join("")}</div></div>` : ""}
          ${weakItems.length ? `<div class="individual-material-column weak"><h3>弱材料 / 注意材料</h3><div class="tag-list">${weakItems.map((item) => `<span class="tag orange">${escapeHtml(item)}</span>`).join("")}</div></div>` : ""}
        </div>
      </section>
    `;
  }

  function emptyCard(title, body = "") {
    return `
      <section class="card">
        <p class="empty-note"><strong>${escapeHtml(title)}</strong>${body ? `<br>${escapeHtml(body)}` : ""}</p>
      </section>
    `;
  }

  function weeklyReviewFor(stock) {
    return weeklyReviews().find((review) => matchesStock(review, stock));
  }

  function monthlyReviewFor(stock) {
    return monthlyReviews().find((review) => matchesStock(review, stock));
  }

  function weeklyReviews() {
    const reviews = Array.isArray(data?.weeklyReviews)
      ? data.weeklyReviews
      : Array.isArray(data?.weeklyReview)
        ? data.weeklyReview
        : data?.weeklyReview
          ? [data.weeklyReview]
          : [];
    return reviews.filter((review) => review && [
      value(review, ["code", "証券コード"], ""),
      value(review, ["name", "stockName", "銘柄名"], ""),
      value(review, ["actualMove", "weeklyResult", "実際の値動き"], ""),
      value(review, ["matchLevel", "一致度"], ""),
      value(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], "")
    ].some(hasValue));
  }

  function monthlyReviews() {
    const reviews = Array.isArray(data?.monthlyReviews)
      ? data.monthlyReviews
      : Array.isArray(data?.monthlyData)
        ? data.monthlyData
        : data?.monthlyData
          ? [data.monthlyData]
          : [];
    return reviews.filter((review) => review && [
      value(review, ["code", "証券コード"], ""),
      value(review, ["name", "stockName", "銘柄名"], ""),
      value(review, ["monthlyConclusion", "conclusion", "月次結論", "結論"], ""),
      value(review, ["monthlyMove", "月間の値動き"], ""),
      value(review, ["nextMonthPolicy", "来月方針", "翌月方針"], "")
    ].some(hasValue));
  }

  function matchesStock(review, stock) {
    const reviewCode = String(value(review, ["code", "証券コード"], ""));
    const reviewName = String(value(review, ["name", "stockName", "銘柄名"], ""));
    return (stock.code && reviewCode === String(stock.code)) || (stock.name && reviewName === String(stock.name));
  }

  function weeklyAction(review) {
    const matchLevel = String(value(review, ["matchLevel", "一致度"], ""));
    const policy = String(value(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], ""));
    if (matchLevel.includes("低") || policy.includes("要注意") || policy.includes("方針見直し")) return "来週は要注意";
    return "様子見";
  }

  function conclusion(stock) {
    return value(stock, ["conclusion", "decision", "結論"], "未設定");
  }

  function value(object, keys, fallback = "") {
    for (const key of keys) {
      const item = object?.[key];
      if (hasValue(item)) return clean(item);
    }
    return fallback;
  }

  function list(raw) {
    const source = Array.isArray(raw) ? raw : hasValue(raw) ? String(raw).split(/[\n｜|]/) : [];
    return source.map(clean).filter(hasValue);
  }

  function rangeText(low, high) {
    const lowText = text(low, "");
    const highText = text(high, "");
    if (lowText && highText) return `${lowText} 〜 ${highText}`;
    return lowText || highText;
  }

  function toneForAction(raw) {
    const item = String(raw || "");
    if (item.includes("要注意") || item.includes("方針見直し") || item.includes("あり")) return "red";
    if (item.includes("なし") || item.includes("様子見")) return "green";
    return "orange";
  }

  function toneForMatch(raw) {
    const item = String(raw || "");
    if (item.includes("低")) return "red";
    if (item.includes("中")) return "orange";
    return "green";
  }

  function chipEl(raw, tone = "green") {
    return `<span class="chip ${tone}">${escapeHtml(text(raw, "未設定"))}</span>`;
  }

  function badge(tone = "green") {
    return `<span class="icon-badge ${tone}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg></span>`;
  }

  function hasValue(raw) {
    if (raw === null || raw === undefined) return false;
    if (Array.isArray(raw)) return raw.length > 0;
    const item = clean(String(raw));
    return Boolean(item && item !== "未入力" && item !== "--" && item !== "---" && item !== "undefined");
  }

  function text(raw, fallback = "") {
    return hasValue(raw) ? clean(String(raw)) : fallback;
  }

  function clean(raw) {
    return String(raw ?? "").replace(/\s{2,}/g, " ").trim();
  }

  function escapeHtml(raw) {
    return String(raw)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function addTimestamp(url) {
    return `${url}${url.includes("?") ? "&" : "?"}individualPatchT=${Date.now()}`;
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .individual-stock-header { align-items: flex-start; justify-content: space-between; gap: 12px; }
      .individual-header-chips { justify-content: flex-end; }
      .individual-material-grid { display: grid; gap: 10px; }
      .individual-material-column { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--color-border); border-radius: 14px; background: #fbfcfb; }
      .individual-material-column h3 { margin: 0; color: var(--color-main-dark); font-size: 0.9rem; }
      .individual-material-column.weak h3 { color: var(--color-orange); }
      @media (min-width: 720px) { .individual-material-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    `;
    document.head.appendChild(style);
  }
})();
