let dashboardData = null;
let dataSourceInfo = { label: "確認中", warning: "" };

const DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";
const state = {
  currentScope: "overall",
  currentPeriod: "daily",
  currentStockCode: ""
};

const SCOPE_OPTIONS = [
  { id: "overall", label: "全体" },
  { id: "individual", label: "個別" }
];

const PERIOD_OPTIONS = [
  { id: "daily", label: "日次" },
  { id: "weekly", label: "週次" },
  { id: "monthly", label: "月次" }
];

document.addEventListener("DOMContentLoaded", async () => {
  const loadResult = await loadDashboardData();
  dashboardData = loadResult.data;
  dataSourceInfo = {
    label: loadResult.sourceLabel,
    warning: loadResult.warning
  };

  logDataDiagnostics(dashboardData);
  renderDataStatus();

  if (!dashboardData) {
    displayLoadError();
    return;
  }

  const stocks = getStocks();
  state.currentStockCode = stocks[0]?.code || "";
  render();
});

async function loadDashboardData() {
  const config = window.STOCK_DASHBOARD_CONFIG || {};
  const remoteUrl = typeof config.REMOTE_DATA_URL === "string" ? config.REMOTE_DATA_URL.trim() : "";

  if (config.USE_REMOTE_DATA === true && remoteUrl) {
    try {
      console.log("fetch remote start");
      const data = await fetchJson(withTimestamp(remoteUrl));
      console.log("fetch remote success");
      console.log("Loaded remote data:", data.stocks?.map((stock) => stock.name));
      return { data, sourceLabel: "Remote JSON", warning: "" };
    } catch (error) {
      console.error("fetch remote failed", error);
      try {
        console.log("jsonp remote start");
        const data = await loadRemoteJsonp(remoteUrl);
        console.log("jsonp remote success");
        console.log("Loaded remote data:", data.stocks?.map((stock) => stock.name));
        return { data, sourceLabel: "Remote JSONP", warning: "" };
      } catch (jsonpError) {
        console.error("jsonp remote failed", jsonpError);
        try {
          const data = await fetchJson(withTimestamp("data.json"));
          console.log("loaded local data.json");
          return {
            data,
            sourceLabel: "Remote失敗 → Local fallback",
            warning: "Remote JSONとJSONPの取得に失敗したため、data.jsonを表示しています"
          };
        } catch (localError) {
          console.error("data.json load failed after remote fallback", localError);
          return {
            data: null,
            sourceLabel: "読み込み失敗",
            warning: "Remote JSON、JSONP、data.jsonのすべてを読み込めませんでした"
          };
        }
      }
    }
  }

  try {
    const data = await fetchJson(withTimestamp("data.json"));
    console.log("loaded local data.json");
    return { data, sourceLabel: "Local data.json", warning: "" };
  } catch (error) {
    console.error("data.json load failed", error);
    return {
      data: null,
      sourceLabel: "読み込み失敗",
      warning: "data.jsonを読み込めませんでした"
    };
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return await response.json();
}

function loadRemoteJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `__stockDashboardJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    let finished = false;

    const cleanup = () => {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    const finish = (handler, value) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      cleanup();
      handler(value);
    };

    const timer = window.setTimeout(() => {
      finish(reject, new Error("JSONP request timed out"));
    }, 10000);

    window[callbackName] = (data) => finish(resolve, data);
    script.onerror = () => finish(reject, new Error("JSONP script load failed"));
    script.src = withParams(url, { callback: callbackName, t: Date.now() });
    document.body.appendChild(script);
  });
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

function render() {
  const stocks = getStocks();
  if (!state.currentStockCode && stocks.length) state.currentStockCode = stocks[0].code;

  document.getElementById("dashboardTitle").textContent = "保有株チェック";
  document.getElementById("dashboardMode").textContent = getModeLabel();
  document.getElementById("dashboardDate").textContent = textValue(dashboardData.meta?.date, "--");
  document.getElementById("targetCount").textContent = `${stocks.length}銘柄`;

  renderNavigation(stocks);

  const content = document.getElementById("content");
  const stock = stocks.find((item) => String(item.code) === String(state.currentStockCode)) || stocks[0];

  if (state.currentScope === "overall" && state.currentPeriod === "daily") content.innerHTML = renderOverallDaily(stocks);
  if (state.currentScope === "overall" && state.currentPeriod === "weekly") content.innerHTML = renderOverallWeekly(stocks);
  if (state.currentScope === "overall" && state.currentPeriod === "monthly") content.innerHTML = renderOverallMonthly(stocks);
  if (state.currentScope === "individual" && state.currentPeriod === "daily") content.innerHTML = stock ? renderIndividualDaily(stock) : renderEmpty("日次データがありません");
  if (state.currentScope === "individual" && state.currentPeriod === "weekly") content.innerHTML = stock ? renderIndividualWeekly(stock) : renderEmpty("週次レビューはまだありません");
  if (state.currentScope === "individual" && state.currentPeriod === "monthly") content.innerHTML = stock ? renderIndividualMonthly(stock) : renderEmpty("月次データはまだありません");
}

function renderNavigation(stocks) {
  document.getElementById("scopeTabs").innerHTML = SCOPE_OPTIONS.map((option) => renderTab(option, state.currentScope, "scope")).join("");
  document.getElementById("periodTabs").innerHTML = PERIOD_OPTIONS.map((option) => renderTab(option, state.currentPeriod, "period")).join("");

  const stockTabs = document.getElementById("stockTabs");
  stockTabs.hidden = state.currentScope !== "individual";
  stockTabs.innerHTML = stocks.map((stock) => `
    <button class="stock-tab" type="button" aria-selected="${stock.code === state.currentStockCode}" data-stock="${escapeAttribute(stock.code)}">
      ${escapeHtml(stock.shortName || stock.name)}
    </button>
  `).join("");

  document.querySelectorAll("[data-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentScope = button.dataset.scope;
      render();
    });
  });

  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentPeriod = button.dataset.period;
      render();
    });
  });

  document.querySelectorAll("[data-stock]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentStockCode = button.dataset.stock;
      render();
    });
  });
}

function renderTab(option, activeValue, key) {
  return `
    <button class="tab-button" type="button" aria-selected="${option.id === activeValue}" data-${key}="${option.id}">
      ${escapeHtml(option.label)}
    </button>
  `;
}

function renderOverallDaily(stocks) {
  const summary = getSummary(stocks);
  const cautionStocks = stocks.filter((stock) => isCautionStock(stock));
  const watchPoints = uniqueList(stocks.flatMap((stock) => normalizeList(stock.watchPoints))).slice(0, 5);
  const triggers = uniqueList(stocks.flatMap((stock) => normalizeList(stock.policyTriggers || stock.triggers))).slice(0, 5);

  return [
    renderHeroCard({
      icon: "shield",
      tone: summary.actionTone,
      title: "対応の必要性",
      result: summary.actionRequired,
      body: summary.reason
    }),
    renderInfoCard("scale", "現在の結論", summary.overallPolicy, renderChipRow(cautionStocks.map((stock) => stock.name), "red", "要注意銘柄なし")),
    cautionStocks.length ? renderInfoCard("alert", "要注意銘柄", "", renderChipRow(cautionStocks.map((stock) => stock.name), "red")) : "",
    renderStockSummaryCard(stocks, "銘柄サマリー"),
    watchPoints.length ? renderListCard("eye", "見るポイント", watchPoints, "green") : "",
    triggers.length ? renderListCard("alert", "方針変更トリガー", triggers, "orange") : ""
  ].filter(Boolean).join("");
}

function renderOverallWeekly(stocks) {
  const reviews = getWeeklyReviews();
  const summary = getWeeklySummary(stocks, reviews);
  const watchPoints = uniqueList(reviews.flatMap((review) => [
    field(review, ["nextImprovement", "nextImprovePoints", "次回に活かす点"]),
    field(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"])
  ])).slice(0, 5);

  return [
    renderHeroCard({
      icon: "target",
      tone: summary.actionTone,
      title: "対応の必要性",
      result: summary.actionRequired,
      body: summary.reason
    }),
    renderStockWeeklySummaryCard(stocks, reviews),
    watchPoints.length ? renderListCard("lightbulb", "次回に活かす点", watchPoints, "green") : renderEmpty("週次レビューはまだありません"),
    renderListCard("flag", "来週に向けた暫定方針", uniqueList(reviews.map((review) => field(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"]))).slice(0, 5), "orange")
  ].filter(Boolean).join("");
}

function renderOverallMonthly(stocks) {
  return [
    renderHeroCard({
      icon: "flag",
      tone: "neutral",
      title: "月次まとめ",
      result: "月次データはまだありません",
      body: "月次表示用データが整うまで、ここには簡易メッセージだけを表示します。"
    }),
    renderStockSummaryCard(stocks, "日次ベースの銘柄一覧")
  ].join("");
}

function renderIndividualDaily(stock) {
  const news = normalizeNews(stock).slice(0, 3);
  const watchPoints = normalizeList(stock.watchPoints);
  const triggers = normalizeList(stock.policyTriggers || stock.triggers);
  const decisionRows = getDecisionRows(stock);

  return [
    renderStockHeader(stock),
    renderHeroCard({
      icon: "shield",
      tone: toneForAction(actionRequired(stock)),
      title: "対応の必要性",
      result: actionRequired(stock),
      body: field(stock, ["todayJudgement", "decisionText", "judgement", "今日時点の判断"], field(stock, ["oneLine", "summaryComment", "一言"], ""))
    }),
    renderMetricCard("chart", "株価サマリー", [
      ["株価", formatPrice(stock.price)],
      ["前日比", formatChange(stock.change, stock.changeRate)],
      ["想定レンジ", formatRange(stock.forecast?.range || stock.weeklyForecast?.range)],
      ["信頼度", field(stock, ["confidence", "自信度"], "")]
    ]),
    decisionRows.length ? renderListCard("scale", "主な理由", decisionRows, "neutral") : "",
    news.length ? renderNewsCard(news) : "",
    watchPoints.length ? renderListCard("eye", "見るポイント", watchPoints, "green") : "",
    triggers.length ? renderListCard("alert", "方針変更トリガー", triggers, "orange") : "",
    hasValue(stock.shortOutlook || stock.shortTermView) ? renderInfoCard("flag", "最短見通し", field(stock, ["shortOutlook", "shortTermView", "最短見通し"], "")) : ""
  ].filter(Boolean).join("");
}

function renderIndividualWeekly(stock) {
  const reviews = getWeeklyReviewsForStock(stock);
  if (!reviews.length) {
    return [
      renderStockHeader(stock),
      renderEmpty("週次レビューはまだありません")
    ].join("");
  }

  return [
    renderStockHeader(stock),
    ...reviews.map((review) => renderReviewDetailCard(review))
  ].join("");
}

function renderIndividualMonthly(stock) {
  return [
    renderStockHeader(stock),
    renderHeroCard({
      icon: "flag",
      tone: "neutral",
      title: "月次評価",
      result: "月次データはまだありません",
      body: "月次表示用データが整うまで、空の項目は表示しません。"
    })
  ].join("");
}

function renderStockHeader(stock) {
  return `
    <section class="card hero-card">
      <div class="card-header">
        ${iconBadge("chart")}
        <div>
          <h2>${escapeHtml(stock.name)} <span class="label">${escapeHtml(stock.code || "--")}</span></h2>
          <div class="chip-row">
            ${renderChip(conclusion(stock), toneForConclusion(conclusion(stock)))}
            ${renderChip(`信頼度 ${field(stock, ["confidence", "自信度"], "未設定")}`, "green")}
          </div>
        </div>
      </div>
      ${hasValue(field(stock, ["oneLine", "summaryComment", "一言"], "")) ? `<p class="lead">${escapeHtml(field(stock, ["oneLine", "summaryComment", "一言"], ""))}</p>` : ""}
    </section>
  `;
}

function renderHeroCard({ icon, tone, title, result, body }) {
  return `
    <section class="card hero-card">
      <div class="card-header">
        ${iconBadge(icon, tone)}
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="hero-result">${escapeHtml(textValue(result, "未設定"))}</p>
        </div>
      </div>
      ${hasValue(body) ? `<p class="lead">${escapeHtml(body)}</p>` : ""}
    </section>
  `;
}

function renderInfoCard(iconName, title, body, extra = "") {
  if (!hasValue(body) && !hasValue(extra)) return "";
  return `
    <section class="card">
      <div class="card-header">
        ${iconBadge(iconName)}
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${hasValue(body) ? `<p class="compact-text">${escapeHtml(body)}</p>` : ""}
      ${extra || ""}
    </section>
  `;
}

function renderMetricCard(iconName, title, rows) {
  const filtered = rows.filter(([, value]) => hasValue(value));
  if (!filtered.length) return "";
  return `
    <section class="card">
      <div class="card-header">
        ${iconBadge(iconName)}
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div class="metric-grid">
        ${filtered.map(([label, value]) => renderMetric(label, value)).join("")}
      </div>
    </section>
  `;
}

function renderStockSummaryCard(stocks, title) {
  if (!stocks.length) return renderEmpty("日次データがありません");
  return `
    <section class="card">
      <div class="card-header">
        ${iconBadge("chart")}
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div>
        ${stocks.map((stock) => `
          <article class="stock-row">
            <div>
              <div class="stock-row-title">
                ${escapeHtml(stock.name)}
                ${renderChip(conclusion(stock), toneForConclusion(conclusion(stock)))}
              </div>
              <p class="footer-note">${escapeHtml(textValue(field(stock, ["oneLine", "summaryComment", "一言"], ""), field(stock, ["code"], "")))}</p>
            </div>
            <div class="stock-price">
              ${escapeHtml(formatPrice(stock.price))}
              <div class="${changeClass(stock.change, stock.changeRate)}">${escapeHtml(formatChange(stock.change, stock.changeRate))}</div>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderStockWeeklySummaryCard(stocks, reviews) {
  if (!reviews.length) return renderEmpty("週次レビューはまだありません");
  return `
    <section class="card">
      <div class="card-header">
        ${iconBadge("target")}
        <h2>銘柄サマリー</h2>
      </div>
      <div class="review-grid">
        ${reviews.map((review) => {
          const stock = stocks.find((item) => String(item.code) === String(field(review, ["code", "証券コード"], "")));
          return `
            <article class="review-card">
              <h3>${escapeHtml(field(review, ["name", "stockName", "銘柄名"], stock?.name || "銘柄"))}</h3>
              ${renderMetric("一致度", field(review, ["matchLevel", "一致度"], ""))}
              ${renderMetric("実際の値動き", field(review, ["actualMove", "weeklyResult", "実際の値動き"], ""))}
              ${renderMetric("来週方針", field(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], ""))}
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderReviewDetailCard(review) {
  return renderMetricCard("target", "週次レビュー", [
    ["実際の値動き", field(review, ["actualMove", "weeklyResult", "実際の値動き"], "")],
    ["一致度", field(review, ["matchLevel", "一致度"], "")],
    ["予想レンジ", formatRangeParts(field(review, ["forecastRangeLow", "想定レンジ下限"], ""), field(review, ["forecastRangeHigh", "想定レンジ上限"], ""))],
    ["実際レンジ", field(review, ["actualRange"], "") || formatRangeParts(field(review, ["actualRangeLow", "実際レンジ下限"], ""), field(review, ["actualRangeHigh", "実際レンジ上限"], ""))],
    ["当たった点", field(review, ["matchedPoints", "hitPoints", "当たった点"], "")],
    ["外れた点", field(review, ["missedPoints", "外れた点"], "")],
    ["次回に活かす点", field(review, ["nextImprovement", "nextImprovePoints", "次回に活かす点"], "")],
    ["来週に向けた暫定方針", field(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], "")]
  ]);
}

function renderNewsCard(newsItems) {
  return `
    <section class="card">
      <div class="card-header">
        ${iconBadge("news")}
        <h2>関連ニュース</h2>
      </div>
      <div class="news-grid">
        ${newsItems.map((news) => {
          const source = field(news, ["source", "ソース"], "");
          const title = field(news, ["title", "headline", "見出し"], "ニュース");
          return `
            <article class="news-card">
              <h3>${isHttpUrl(source) ? `<a href="${escapeAttribute(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>` : escapeHtml(title)}</h3>
              ${hasValue(field(news, ["content", "内容"], "")) ? `<p>${escapeHtml(field(news, ["content", "内容"], ""))}</p>` : ""}
              <p class="footer-note">${escapeHtml(field(news, ["impact", "影響"], ""))}${hasValue(source) && !isHttpUrl(source) ? ` / ${escapeHtml(source)}` : ""}</p>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderListCard(iconName, title, items, tone = "green") {
  const normalized = normalizeList(items);
  if (!normalized.length) return "";
  return `
    <section class="card">
      <div class="card-header">
        ${iconBadge(iconName, tone)}
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div class="tag-list">
        ${normalized.map((item) => `<span class="tag ${tone}">${escapeHtml(item)}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderChipRow(items, tone = "green", emptyText = "") {
  const normalized = normalizeList(items);
  if (!normalized.length) return emptyText ? `<p class="footer-note">${escapeHtml(emptyText)}</p>` : "";
  return `<div class="chip-row">${normalized.map((item) => renderChip(item, tone)).join("")}</div>`;
}

function renderMetric(label, value) {
  if (!hasValue(value)) return "";
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function renderChip(text, tone = "neutral") {
  return `<span class="chip ${tone}">${escapeHtml(textValue(text, "未設定"))}</span>`;
}

function renderEmpty(message) {
  return `<section class="card"><p class="empty-note">${escapeHtml(message)}</p></section>`;
}

function getStocks() {
  return Array.isArray(dashboardData?.stocks) ? dashboardData.stocks.filter(Boolean) : [];
}

function getWeeklyReviews() {
  if (Array.isArray(dashboardData?.weeklyReviews)) return dashboardData.weeklyReviews.filter(Boolean);
  if (Array.isArray(dashboardData?.weeklyReview)) return dashboardData.weeklyReview.filter(Boolean);
  return dashboardData?.weeklyReview ? [dashboardData.weeklyReview] : [];
}

function getWeeklyReviewsForStock(stock) {
  return getWeeklyReviews().filter((review) => {
    const reviewCode = String(field(review, ["code", "証券コード"], ""));
    const reviewName = String(field(review, ["name", "stockName", "銘柄名"], ""));
    return (stock.code && reviewCode === String(stock.code)) || (stock.name && reviewName === String(stock.name));
  });
}

function getSummary(stocks) {
  const summary = dashboardData.summary || {};
  const cautionStocks = stocks.filter((stock) => isCautionStock(stock));
  const hasAction = stocks.some((stock) => actionRequired(stock) === "あり");
  const hasCaution = cautionStocks.length > 0 || stocks.some((stock) => actionRequired(stock) === "要注意");
  const actionRequiredText = hasAction ? "あり" : hasCaution ? "要注意" : textValue(field(summary, ["actionRequired", "needAction", "todayAction"], ""), "なし");
  const reason = field(summary, ["reason", "主な理由"], "") ||
    (cautionStocks.length ? `${cautionStocks.map((stock) => stock.name).join(" / ")} を中心に確認します。` : field(summary, ["weeklyFocus"], ""));

  return {
    actionRequired: actionRequiredText,
    actionTone: toneForAction(actionRequiredText),
    overallPolicy: field(summary, ["overallPolicy", "全体方針"], makeOverallPolicy(stocks)),
    reason: textValue(reason, "大きな対応が必要な銘柄はありません。")
  };
}

function getWeeklySummary(stocks, reviews) {
  const lowMatch = reviews.some((review) => String(field(review, ["matchLevel", "一致度"], "")).includes("低"));
  const actionRequiredText = lowMatch ? "来週は要注意" : reviews.length ? "様子見継続" : "週次レビューはまだありません";
  return {
    actionRequired: actionRequiredText,
    actionTone: lowMatch ? "orange" : "green",
    reason: reviews.length ? "週次レビューの一致度と来週方針を確認します。" : "週次レビュー表示データが入ると、ここに要約が表示されます。"
  };
}

function makeOverallPolicy(stocks) {
  const conclusions = stocks.map((stock) => conclusion(stock)).filter(hasValue);
  if (conclusions.some((text) => text.includes("方針見直し"))) return "方針見直しあり";
  if (conclusions.some((text) => text.includes("要注意"))) return "放置・要注意";
  if (conclusions.some((text) => text.includes("放置"))) return "放置寄り";
  return "未設定";
}

function conclusion(stock) {
  return field(stock, ["conclusion", "decision", "結論"], "未設定");
}

function actionRequired(stock) {
  const value = field(stock, ["todayAction", "actionRequired", "needAction", "今日動く必要"], "なし");
  if (String(value).includes("要注意")) return "要注意";
  if (String(value).includes("あり")) return "あり";
  return value || "なし";
}

function isCautionStock(stock) {
  const text = `${conclusion(stock)} ${actionRequired(stock)}`;
  return text.includes("要注意") || text.includes("方針見直し");
}

function getDecisionRows(stock) {
  const details = Array.isArray(stock.decisionDetails) ? stock.decisionDetails : [];
  const rows = details.map((item) => `${item.label}: ${item.value}`).filter(hasValue);
  const breakdown = stock.decisionBreakdown || {};
  return rows.length ? rows : [
    hasValue(breakdown.buy) ? `買い増し: ${breakdown.buy}` : "",
    hasValue(breakdown.takeProfit) ? `利確: ${breakdown.takeProfit}` : "",
    hasValue(breakdown.hold) ? `放置: ${breakdown.hold}` : ""
  ].filter(hasValue);
}

function normalizeNews(stock) {
  const news = stock.relatedNews || stock.news || [];
  return Array.isArray(news) ? news.filter((item) => hasValue(field(item, ["title", "headline", "見出し"], "")) || hasValue(field(item, ["content", "内容"], ""))) : [];
}

function normalizeList(value) {
  const source = Array.isArray(value) ? value : hasValue(value) ? String(value).split(/[\n｜|]/) : [];
  return source.map((item) => cleanReferenceText(item)).filter(hasValue);
}

function uniqueList(items) {
  const seen = new Set();
  return normalizeList(items).filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function field(object, keys, fallback = "") {
  for (const key of keys) {
    const value = object?.[key];
    if (hasValue(value)) return cleanReferenceText(value);
  }
  return fallback;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  const text = cleanReferenceText(String(value));
  return Boolean(text && text !== "未入力" && text !== "--" && text !== "---");
}

function textValue(value, fallback = "") {
  return hasValue(value) ? cleanReferenceText(String(value)) : fallback;
}

function formatPrice(value) {
  if (!hasValue(value)) return "--";
  const raw = cleanReferenceText(String(value));
  if (raw.includes("円")) return raw;
  const number = Number(normalizeNumericText(raw));
  return Number.isFinite(number) ? `${number.toLocaleString("ja-JP")}円` : raw;
}

function formatChange(change, rate) {
  const changeText = formatSignedYen(change);
  const rateText = formatPercent(rate);
  if (changeText === "--" && rateText === "--") return "--";
  if (changeText === "--") return rateText;
  if (rateText === "--") return changeText;
  return `${changeText} / ${rateText}`;
}

function formatSignedYen(value) {
  if (!hasValue(value)) return "--";
  const raw = cleanReferenceText(String(value));
  if (raw.includes("円")) return raw;
  const number = Number(normalizeNumericText(raw));
  if (!Number.isFinite(number)) return raw;
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toLocaleString("ja-JP")}円`;
}

function formatPercent(value) {
  if (!hasValue(value)) return "--";
  const raw = cleanReferenceText(String(value));
  if (raw.includes("%")) return raw;
  const number = Number(normalizeNumericText(raw));
  if (!Number.isFinite(number)) return raw;
  const percent = Math.abs(number) > 0 && Math.abs(number) <= 0.2 ? number * 100 : number;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

function formatRange(range) {
  if (!hasValue(range)) return "";
  if (typeof range === "string") return cleanReferenceText(range);
  return formatRangeParts(range.low, range.high);
}

function formatRangeParts(low, high, fallback = "") {
  const lowText = textValue(low, "");
  const highText = textValue(high, "");
  if (lowText && highText) return `${lowText} 〜 ${highText}`;
  return lowText || highText || fallback;
}

function changeClass(change, rate) {
  const text = `${change ?? ""} ${rate ?? ""}`;
  if (text.includes("-") || text.includes("－")) return "negative";
  if (text.includes("+") || text.includes("＋")) return "positive";
  return "neutral";
}

function toneForAction(value) {
  const text = String(value || "");
  if (text.includes("あり") || text.includes("要注意")) return "red";
  if (text.includes("なし")) return "green";
  return "orange";
}

function toneForConclusion(value) {
  const text = String(value || "");
  if (text.includes("要注意") || text.includes("方針見直し")) return "red";
  if (text.includes("放置")) return "green";
  return "orange";
}

function getModeLabel() {
  const scope = state.currentScope === "overall" ? "全体" : "個別";
  const period = PERIOD_OPTIONS.find((item) => item.id === state.currentPeriod)?.label || "日次";
  return `${scope} / ${period}`;
}

function renderDataStatus() {
  const status = document.getElementById("dataStatus");
  if (!status) return;

  if (!DEBUG_MODE) {
    status.hidden = true;
    status.innerHTML = "";
    return;
  }

  status.hidden = false;
  status.classList.toggle("is-warning", Boolean(dataSourceInfo.warning));
  status.innerHTML = `
    <span>データ取得元：${escapeHtml(dataSourceInfo.label)}</span>
    ${dataSourceInfo.warning ? `<small>${escapeHtml(dataSourceInfo.warning)}</small>` : ""}
    ${dashboardData ? `<small>${escapeHtml(getDebugSummary(dashboardData))}</small>` : ""}
  `;
}

function getDebugSummary(data) {
  const stocks = Array.isArray(data?.stocks) ? data.stocks : [];
  const weeklyReviews = Array.isArray(data?.weeklyReviews) ? data.weeklyReviews : [];
  const firstStock = stocks[0];
  return [
    `dashboard件数: ${Array.isArray(data?.dashboard) ? data.dashboard.length : 0}`,
    `stocks件数: ${stocks.length}`,
    `weeklyReviews件数: ${weeklyReviews.length}`,
    firstStock ? `先頭銘柄: ${firstStock.name || "--"} / price=${firstStock.price ?? "---"} / change=${firstStock.change ?? "---"} / range=${formatRange(firstStock.forecast?.range || firstStock.weeklyForecast?.range)}` : ""
  ].filter(Boolean).join(" / ");
}

function logDataDiagnostics(data) {
  if (!DEBUG_MODE || !data) return;
  const firstStock = Array.isArray(data.stocks) ? data.stocks[0] : null;
  console.log("dashboard diagnostics", {
    dashboardCount: Array.isArray(data.dashboard) ? data.dashboard.length : 0,
    stocksCount: Array.isArray(data.stocks) ? data.stocks.length : 0,
    weeklyReviewsCount: Array.isArray(data.weeklyReviews) ? data.weeklyReviews.length : 0,
    firstStock: firstStock ? {
      name: firstStock.name,
      price: firstStock.price,
      change: firstStock.change,
      forecastRange: firstStock.forecast?.range || firstStock.weeklyForecast?.range
    } : null
  });
}

function displayLoadError() {
  document.getElementById("dashboardTitle").textContent = "保有株チェック";
  document.getElementById("dashboardMode").textContent = "読み込み失敗";
  document.getElementById("dashboardDate").textContent = "--";
  document.getElementById("targetCount").textContent = "0銘柄";
  document.getElementById("scopeTabs").innerHTML = "";
  document.getElementById("periodTabs").innerHTML = "";
  document.getElementById("stockTabs").innerHTML = "";
  document.getElementById("content").innerHTML = `<p class="error">データを読み込めませんでした</p>`;
}

function iconBadge(name, tone = "green") {
  return `<span class="icon-badge ${tone}">${icon(name)}</span>`;
}

function icon(name) {
  const paths = {
    shield: '<path d="M12 3l7 3v5c0 5-3.4 8.1-7 10-3.6-1.9-7-5-7-10V6l7-3z"></path><path d="M9 12l2 2 4-5"></path>',
    scale: '<path d="M12 3v18"></path><path d="M5 7h14"></path><path d="M6 7l-4 7h8L6 7z"></path><path d="M18 7l-4 7h8l-4-7z"></path>',
    alert: '<path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>',
    chart: '<path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 16v-5"></path><path d="M12 16V8"></path><path d="M16 16v-3"></path>',
    target: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M2 12h3"></path><path d="M19 12h3"></path>',
    check: '<path d="M20 6L9 17l-5-5"></path>',
    x: '<path d="M18 6L6 18"></path><path d="M6 6l12 12"></path>',
    lightbulb: '<path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8 14a6 6 0 1 1 8 0c-.8.7-1 1.4-1 2H9c0-.6-.2-1.3-1-2z"></path>',
    flag: '<path d="M5 22V4"></path><path d="M5 4h11l-1.5 4L16 12H5"></path>',
    news: '<path d="M4 5h14a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V5z"></path><path d="M8 9h8"></path><path d="M8 13h8"></path><path d="M8 17h4"></path>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.check}</svg>`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function cleanReferenceText(value) {
  return String(value ?? "")
    .replace(/\{?\s*"?(?:xcontentReference|contentReference)"?\s*:[^}\n]+}?\s*/gi, "")
    .replace(/\{?\s*"?sourceReference"?\s*:[^}\n]+}?\s*/gi, "")
    .replace(/\b(?:xcontentReference|contentReference|sourceReference|turn|cite|index)\s*[:=]\s*[\w.-]+/gi, "")
    .replace(/【[^】]*(?:xcontentReference|contentReference|sourceReference|turn|cite|index)[^】]*】/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeNumericText(value) {
  const text = String(value ?? "")
    .replace(/[,\u00a0\u3000\s円￥%]/g, "")
    .replace(/[＋]/g, "+")
    .replace(/[－ー―]/g, "-")
    .trim();
  if (!text || /^#(?:ERROR|N\/A|VALUE|REF|DIV\/0)!?$/i.test(text)) return "";
  return text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
