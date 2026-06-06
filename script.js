let dashboardData = null;
let activeTab = "all";
let dataSourceInfo = { label: "確認中", warning: "" };

const DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";
const INTERNAL_DISPLAY_TYPES = new Set(["HTMLカード", "htmlカード", "HTML card", "html card"]);
const DISPLAY_TYPE_TITLES = new Map([
  ["月曜チェック", "月曜チェック / 今週の予想"],
  ["今週の予想", "月曜チェック / 今週の予想"],
  ["毎朝チェック", "毎朝チェック"],
  ["週次レビュー", "週次レビュー / 予想の答え合わせ"],
  ["予想の答え合わせ", "週次レビュー / 予想の答え合わせ"]
]);

document.addEventListener("DOMContentLoaded", async () => {
  const loadResult = await loadDashboardData();
  dashboardData = loadResult.data;
  dataSourceInfo = { label: loadResult.sourceLabel, warning: loadResult.warning };
  renderDataStatus();
  if (!dashboardData) {
    displayLoadError();
    return;
  }
  renderDashboard();
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
          return { data, sourceLabel: "Remote失敗 → Local fallback", warning: "Remote JSONとJSONPの取得に失敗したため、data.jsonを表示しています" };
        } catch (localError) {
          console.error("data.json load failed after remote fallback", localError);
          return { data: null, sourceLabel: "読み込み失敗", warning: "Remote JSON、JSONP、data.jsonのすべてを読み込めませんでした" };
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
    return { data: null, sourceLabel: "読み込み失敗", warning: "data.jsonを読み込めませんでした" };
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
    const timer = window.setTimeout(() => finish(reject, new Error("JSONP request timed out")), 10000);
    window[callbackName] = (data) => finish(resolve, data);
    script.onerror = () => finish(reject, new Error("JSONP script load failed"));
    script.src = withParams(url, { callback: callbackName, t: Date.now() });
    document.body.appendChild(script);
  });
}

function withTimestamp(url) { return withParams(url, { t: Date.now() }); }
function withParams(url, params) {
  const query = Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
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
  status.innerHTML = `<span>データ取得元：${escapeHtml(dataSourceInfo.label)}</span>${dataSourceInfo.warning ? `<small>${escapeHtml(dataSourceInfo.warning)}</small>` : ""}`;
}

function displayLoadError() {
  document.getElementById("dashboardTitle").textContent = "保有株チェック";
  document.getElementById("dashboardMode").textContent = getDashboardSubtitle(null);
  document.getElementById("dashboardDate").textContent = "--";
  document.getElementById("targetCount").textContent = "0銘柄";
  document.getElementById("tabs").innerHTML = "";
  document.getElementById("content").innerHTML = `<p class="error">データを読み込めませんでした</p>`;
}

function renderDashboard() {
  const stocks = Array.isArray(dashboardData.stocks) ? dashboardData.stocks : [];
  document.getElementById("dashboardTitle").textContent = "保有株チェック";
  document.getElementById("dashboardMode").textContent = getDashboardSubtitle(dashboardData.meta);
  document.getElementById("dashboardDate").textContent = dashboardData.meta?.date || "--";
  document.getElementById("targetCount").textContent = `${stocks.length}銘柄`;
  renderTabs(stocks);
  renderContent(stocks);
}

function getDashboardSubtitle(meta) {
  const displayType = normalizeText(meta?.dashboardType || meta?.screenType || meta?.displayType || meta?.type);
  if (displayType && !INTERNAL_DISPLAY_TYPES.has(displayType)) {
    for (const [keyword, title] of DISPLAY_TYPE_TITLES) if (displayType.includes(keyword)) return title;
  }
  const day = new Date().getDay();
  if (day === 1) return "月曜チェック / 今週の予想";
  if (day === 6) return "週次レビュー / 予想の答え合わせ";
  return "毎朝チェック";
}

function normalizeText(value) { return typeof value === "string" ? value.trim() : ""; }

function renderTabs(stocks) {
  const tabs = [{ id: "all", label: "全体" }, ...stocks.map((stock) => ({ id: stock.code, label: stock.shortName || stock.name }))];
  document.getElementById("tabs").innerHTML = tabs.map((tab) => `<button class="tab-button" type="button" role="tab" aria-selected="${tab.id === activeTab}" data-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join("");
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      renderDashboard();
    });
  });
}

function renderContent(stocks) {
  const content = document.getElementById("content");
  if (activeTab === "all") {
    content.innerHTML = renderOverview(stocks);
    return;
  }
  const stock = stocks.find((item) => String(item.code) === String(activeTab));
  content.innerHTML = stock ? renderStock(stock) : `<p class="error">表示対象が見つかりません。</p>`;
}

function renderOverview(stocks) {
  const summary = dashboardData.summary || {};
  return `<section class="card"><h2>全体サマリー</h2><div class="summary-grid">${renderMetric("今日動く必要", summary.actionRequired || summary.needAction || "なし")}${renderMetric("全体方針", summary.overallPolicy || "未設定")}${renderMetric("要注意銘柄", summary.watchStock || summary.alertStock || "未設定")}${renderMetric("今週の焦点", summary.weeklyFocus || "未設定")}</div></section><section class="section-band"><h2>銘柄まとめ</h2><div class="stock-grid">${stocks.map(renderStockSummary).join("")}</div></section><section class="card"><h2>共通チェックポイント</h2>${renderList(summary.commonCheckpoints || [])}</section><section class="card"><h2>週次レビュー</h2>${renderWeeklyReview(getWeeklyReviews())}</section>`;
}

function renderStockSummary(stock) {
  return `<article class="card"><div class="badge-row">${renderBadge(stock.conclusion || "未設定", "hold")}${renderBadge(`信頼度 ${stock.confidence || "未設定"}`, "watch")}</div><h3>${escapeHtml(stock.name)}</h3><p class="lead">${escapeHtml(cleanReferenceText(stock.oneLine || stock.summaryComment || ""))}</p><div class="metric-grid">${renderMetric("証券コード", stock.code || "--")}${renderMetric("株価", formatYen(stock.price))}${renderMetric("前日比", formatChange(stock.change, stock.changeRate))}${renderMetric("注意度", stock.attentionLevel || stock.priority || "未設定")}</div></article>`;
}

function renderStock(stock) {
  const forecast = stock.forecast || stock.weeklyForecast || {};
  const decisionDetails = stock.decisionDetails || breakdownToList(stock.decisionBreakdown);
  const relatedNews = stock.relatedNews || stock.news || [];
  const triggers = stock.policyTriggers || stock.triggers || [];
  return `<section class="card"><div class="badge-row">${renderBadge(stock.conclusion || "未設定", "hold")}${renderBadge(`信頼度 ${stock.confidence || "未設定"}`, "watch")}</div><h2>${escapeHtml(stock.name)} <span class="label">${escapeHtml(stock.code || "--")}</span></h2><p class="lead">${escapeHtml(cleanReferenceText(stock.oneLine || stock.summaryComment || ""))}</p><div class="metric-grid">${renderMetric("株価", formatYen(stock.price))}${renderMetric("前日比", formatChange(stock.change, stock.changeRate))}${renderMetric("今週動く必要", stock.actionRequired || stock.needAction || "なし")}${renderMetric("想定レンジ", formatRange(forecast.range))}</div></section><section class="card"><h2>今日時点の判断</h2><p>${escapeHtml(cleanReferenceText(stock.todayJudgement || stock.decisionText || "基本方針をもとに確認してください。"))}</p><ul class="decision-list">${decisionDetails.map((item) => `<li><span class="label">${escapeHtml(item.label)}</span>${escapeHtml(cleanReferenceText(item.value))}</li>`).join("")}</ul></section><section class="section-band"><h2>関連ニュース</h2><p class="lead">${escapeHtml(cleanReferenceText(stock.newsSummary || stock.newsTrend || ""))}</p><div class="news-grid">${relatedNews.slice(0, 3).map(renderNews).join("") || `<p class="footer-note">ニュースは未設定です。</p>`}</div></section><section class="card"><h2>今週の予想</h2><div class="policy-grid">${renderPolicy("強い場合", forecast.strongCase || "")}${renderPolicy("弱い場合", forecast.weakCase || "")}${renderPolicy("基本想定", forecast.baseCase || forecast.forecast || forecast.prediction || "")}</div></section><section class="card"><h2>今後見るポイント</h2><div class="tag-list">${(stock.watchPoints || []).map((point) => `<span class="tag">${escapeHtml(cleanReferenceText(point))}</span>`).join("") || `<span class="tag">未設定</span>`}</div></section><section class="card"><h2>方針変更トリガー</h2>${renderList(triggers)}</section><section class="card"><h2>最短の見通し</h2><p class="footer-note">${escapeHtml(cleanReferenceText(stock.shortOutlook || stock.shortTermView || ""))}</p></section>`;
}

function breakdownToList(breakdown) {
  if (!breakdown) return [];
  return [{ label: "買い増し", value: breakdown.buy || "" }, { label: "利確", value: breakdown.takeProfit || "" }, { label: "保有", value: breakdown.hold || "" }].filter((item) => item.value);
}

function renderNews(news) {
  const title = cleanReferenceText(news.title || "無題");
  const content = cleanReferenceText(news.content || "");
  const impact = cleanReferenceText(news.impact || "未設定");
  const source = cleanReferenceText(news.source || "未設定");
  const titleHtml = isHttpUrl(source) ? `<a href="${escapeAttribute(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>` : escapeHtml(title);
  const sourceHtml = isHttpUrl(source) ? `<a href="${escapeAttribute(source)}" target="_blank" rel="noopener noreferrer">記事を開く</a>` : escapeHtml(source);
  return `<article class="news-item"><h3>${titleHtml}</h3><p>${escapeHtml(content)}</p><p class="footer-note">株価への影響: ${escapeHtml(impact)} / ソース: ${sourceHtml}</p></article>`;
}

function renderPolicy(label, value) {
  return `<article class="policy-item"><span class="label">${escapeHtml(label)}</span><p>${escapeHtml(cleanReferenceText(value || "未設定"))}</p></article>`;
}

function getWeeklyReviews() {
  if (Array.isArray(dashboardData.weeklyReviews)) return dashboardData.weeklyReviews;
  if (Array.isArray(dashboardData.weeklyReview)) return dashboardData.weeklyReview;
  return dashboardData.weeklyReview ? [dashboardData.weeklyReview] : [];
}

function renderWeeklyReview(reviews) {
  const items = Array.isArray(reviews) ? reviews : [reviews].filter(Boolean);
  if (items.length === 0) return `<p class="footer-note">週次レビューはまだありません。</p>`;
  return `<div class="review-grid">${items.map(renderWeeklyReviewItem).join("")}</div>`;
}

function renderWeeklyReviewItem(review) {
  const rows = [["週", review.week || review["週"]], ["銘柄名", review.name || review.stockName || review["銘柄名"]], ["証券コード", review.code || review["証券コード"]], ["週間結果", review.weeklyResult || review.actualMove || review["実際の値動き"]], ["月曜予想", review.mondayForecast || review.weeklyForecast || review["月曜予想"] || review["今週予想"]], ["実際のレンジ", formatReviewRange(review)], ["一致度", review.matchLevel || review["一致度"]], ["当たった点", review.matchedPoints || review["当たった点"]], ["外れた点", review.missedPoints || review["外れた点"]], ["次回改善", review.nextImprovement || review["次回に活かす点"]], ["暫定次回方針", review.provisionalNextPolicy || review["来週に向けた暫定方針"]]];
  return `<article class="review-item">${rows.map(([label, value]) => renderMetric(label, value || "未入力")).join("")}</article>`;
}

function formatReviewRange(review) {
  const direct = review.actualRange || review["実際のレンジ"];
  if (direct) return direct;
  const low = review.actualRangeLow || review["実際レンジ下限"];
  const high = review.actualRangeHigh || review["実際レンジ上限"];
  if (!low && !high) return "";
  return `${low || "--"} - ${high || "--"}`;
}

function renderMetric(label, value) { return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(cleanReferenceText(String(value)))}</strong></div>`; }
function renderBadge(text, type = "") { return `<span class="badge ${type}">${escapeHtml(cleanReferenceText(text))}</span>`; }
function renderList(items) { return !items || items.length === 0 ? `<p class="footer-note">未設定です。</p>` : `<ul class="plain-list">${items.map((item) => `<li>${escapeHtml(cleanReferenceText(item))}</li>`).join("")}</ul>`; }
function formatYen(value) { if (value === null || value === undefined || value === "") return "--"; const number = Number(value); return Number.isFinite(number) ? `${number.toLocaleString("ja-JP")}円` : escapeHtml(String(value)); }
function formatChange(change, rate) { const changeText = formatYenChange(change); const rateText = formatPercent(rate); return changeText === "--" && rateText === "--" ? "--" : `${changeText} / ${rateText}`; }
function formatYenChange(value) { if (value === null || value === undefined || value === "") return "--"; const number = Number(value); if (!Number.isFinite(number)) return cleanReferenceText(String(value)); const sign = number > 0 ? "+" : ""; return `${sign}${number.toLocaleString("ja-JP")}円`; }
function formatPercent(value) { if (value === null || value === undefined || value === "") return "--"; const raw = String(value).trim(); const hasPercent = raw.includes("%"); const number = Number(raw.replace("%", "")); if (!Number.isFinite(number)) return cleanReferenceText(raw); const percent = !hasPercent && Math.abs(number) > 0 && Math.abs(number) <= 0.2 ? number * 100 : number; const sign = percent > 0 ? "+" : ""; return `${sign}${percent.toFixed(2)}%`; }
function formatRange(range) { if (!range) return "未設定"; if (typeof range === "string") return cleanReferenceText(range); if (typeof range === "object") return `${range.low ?? "--"} - ${range.high ?? "--"}`; return String(range); }
function isHttpUrl(value) { try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }
function cleanReferenceText(value) { return String(value ?? "").replace(/\{?\s*"?contentReference"?\s*:[^}\n]+}?\s*/gi, "").replace(/\{?\s*"?sourceReference"?\s*:[^}\n]+}?\s*/gi, "").replace(/\b(?:contentReference|sourceReference|turn|cite|index)\s*[:=]\s*[\w.-]+/gi, "").replace(/【[^】]*(?:contentReference|sourceReference|turn|cite|index)[^】]*】/gi, "").replace(/\s{2,}/g, " ").trim(); }
function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escapeAttribute(value) { return escapeHtml(value).replaceAll("`", "&#096;"); }
