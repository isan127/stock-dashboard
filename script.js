let dashboardData = null;
let activeTab = "all";
let dataSourceInfo = { label: "確認中", warning: "" };

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
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${query}`;
}

function renderDataStatus() {
  const status = document.getElementById("dataStatus");
  if (!status) return;
  status.classList.toggle("is-warning", Boolean(dataSourceInfo.warning));
  status.innerHTML = `<span>データ取得元：${escapeHtml(dataSourceInfo.label)}</span>${dataSourceInfo.warning ? `<small>${escapeHtml(dataSourceInfo.warning)}</small>` : ""}`;
}

function displayLoadError() {
  document.getElementById("dashboardDate").textContent = "--";
  document.getElementById("targetCount").textContent = "0銘柄";
  document.getElementById("tabs").innerHTML = "";
  document.getElementById("content").innerHTML = `<p class="error">データを読み込めませんでした</p>`;
}

function renderDashboard() {
  document.getElementById("dashboardMode").textContent = dashboardData.meta.displayType;
  document.getElementById("dashboardDate").textContent = dashboardData.meta.date;
  document.getElementById("targetCount").textContent = `${dashboardData.stocks.length}銘柄`;
  renderTabs();
  renderContent();
}

function renderTabs() {
  const tabs = [{ id: "all", label: "全体" }, ...dashboardData.stocks.map((stock) => ({ id: stock.code, label: stock.shortName || stock.name }))];
  document.getElementById("tabs").innerHTML = tabs.map((tab) => `<button class="tab-button" type="button" role="tab" aria-selected="${tab.id === activeTab}" data-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join("");
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      renderDashboard();
    });
  });
}

function renderContent() {
  const content = document.getElementById("content");
  if (activeTab === "all") {
    content.innerHTML = renderOverview();
    return;
  }
  const stock = dashboardData.stocks.find((item) => item.code === activeTab);
  content.innerHTML = stock ? renderStock(stock) : `<p class="error">表示対象が見つかりません。</p>`;
}

function renderOverview() {
  const { summary, stocks } = dashboardData;
  return `<section class="card"><h2>全体サマリー</h2><div class="summary-grid">${renderMetric("今日動く必要", summary.actionRequired)}${renderMetric("全体方針", summary.overallPolicy)}${renderMetric("要注意銘柄", summary.watchStock)}${renderMetric("今週の焦点", summary.weeklyFocus)}</div></section><section class="section-band"><h2>3銘柄まとめ</h2><div class="stock-grid">${stocks.map(renderStockSummary).join("")}</div></section><section class="card"><h2>共通チェックポイント</h2>${renderList(summary.commonCheckpoints)}</section><section class="card"><h2>週次レビュー用メモ</h2>${renderWeeklyReview(dashboardData.weeklyReview)}</section>`;
}

function renderStockSummary(stock) {
  return `<article class="card"><div class="badge-row">${renderBadge(stock.conclusion, "hold")}${renderBadge(`信頼度 ${stock.confidence}`, "watch")}</div><h3>${escapeHtml(stock.name)}</h3><p class="lead">${escapeHtml(stock.oneLine)}</p><div class="metric-grid">${renderMetric("証券コード", stock.code)}${renderMetric("株価", formatYen(stock.price))}${renderMetric("前日比", formatChange(stock.change, stock.changeRate))}${renderMetric("注意度", stock.attentionLevel)}</div></article>`;
}

function renderStock(stock) {
  return `<section class="card"><div class="badge-row">${renderBadge(stock.conclusion, "hold")}${renderBadge(`信頼度 ${stock.confidence}`, "watch")}</div><h2>${escapeHtml(stock.name)} <span class="label">${escapeHtml(stock.code)}</span></h2><p class="lead">${escapeHtml(stock.oneLine)}</p><div class="metric-grid">${renderMetric("株価", formatYen(stock.price))}${renderMetric("前日比", formatChange(stock.change, stock.changeRate))}${renderMetric("今週動く必要", stock.actionRequired)}${renderMetric("想定レンジ", stock.forecast.range)}</div></section><section class="card"><h2>今日時点の判断</h2><p>${escapeHtml(stock.todayJudgement)}</p><ul class="decision-list">${stock.decisionDetails.map((item) => `<li><span class="label">${escapeHtml(item.label)}</span>${escapeHtml(item.value)}</li>`).join("")}</ul></section><section class="section-band"><h2>関連ニュース</h2><p class="lead">${escapeHtml(stock.newsSummary)}</p><div class="news-grid">${stock.relatedNews.slice(0, 3).map(renderNews).join("")}</div></section><section class="card"><h2>今週の予想</h2><div class="policy-grid">${renderPolicy("強い場合", stock.forecast.strongCase)}${renderPolicy("弱い場合", stock.forecast.weakCase)}${renderPolicy("基本想定", stock.forecast.baseCase)}</div></section><section class="card"><h2>今後見るポイント</h2><div class="tag-list">${stock.watchPoints.map((point) => `<span class="tag">${escapeHtml(point)}</span>`).join("")}</div></section><section class="card"><h2>方針変更トリガー</h2>${renderList(stock.policyTriggers)}</section><section class="card"><h2>最短の見通し</h2><p class="footer-note">${escapeHtml(stock.shortOutlook)}</p></section>`;
}

function renderNews(news) {
  return `<article class="news-item"><h3>${escapeHtml(news.title)}</h3><p>${escapeHtml(news.content)}</p><p class="footer-note">株価への影響: ${escapeHtml(news.impact)} / ソース: ${escapeHtml(news.source)}</p></article>`;
}

function renderPolicy(label, value) {
  return `<article class="policy-item"><span class="label">${escapeHtml(label)}</span><p>${escapeHtml(value)}</p></article>`;
}

function renderWeeklyReview(review) {
  if (!review) return `<p class="footer-note">週次レビューは未入力です。</p>`;
  const items = [["週間結果", review.weeklyResult], ["月曜予想", review.mondayForecast], ["実際のレンジ", review.actualRange], ["一致度", review.matchLevel], ["当たった点", review.matchedPoints], ["外れた点", review.missedPoints], ["次回改善", review.nextImprovement], ["暫定次回方針", review.provisionalNextPolicy]];
  return `<div class="summary-grid">${items.map(([label, value]) => renderMetric(label, value || "未入力")).join("")}</div>`;
}

function renderMetric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}
function renderBadge(text, type = "") { return `<span class="badge ${type}">${escapeHtml(text)}</span>`; }
function renderList(items) { return `<ul class="plain-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`; }
function formatYen(value) { return `${Number(value).toLocaleString("ja-JP")}円`; }
function formatChange(change, rate) { const sign = change > 0 ? "+" : ""; return `${sign}${Number(change).toLocaleString("ja-JP")}円 / ${sign}${rate}%`; }
function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
