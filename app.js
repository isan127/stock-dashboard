(() => {
  const DEBUG_MODE = new URLSearchParams(location.search).get("debug") === "1";
  const state = {
    scope: "overall",
    period: "daily",
    stockCode: ""
  };
  let dashboardData = null;
  let dataSource = { label: "確認中", warning: "" };

  const scopeOptions = [
    ["overall", "全体"],
    ["individual", "個別"]
  ];
  const periodOptions = [
    ["daily", "日次"],
    ["weekly", "週次"],
    ["monthly", "月次"]
  ];

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    document.body.classList.add("terminal-theme");
    const result = await loadDashboardData();
    dashboardData = result.data;
    dataSource = { label: result.sourceLabel, warning: result.warning };

    if (!dashboardData) {
      renderLoadError();
      return;
    }

    const stocks = getStocks();
    state.stockCode = stocks[0]?.code || "";
    render();
  }

  async function loadDashboardData() {
    const config = window.STOCK_DASHBOARD_CONFIG || {};
    const remoteUrl = typeof config.REMOTE_DATA_URL === "string" ? config.REMOTE_DATA_URL.trim() : "";

    if (config.USE_REMOTE_DATA === true && remoteUrl) {
      try {
        console.log("fetch remote start");
        const data = await fetchJson(withTimestamp(remoteUrl));
        console.log("fetch remote success", data.stocks?.map((stock) => stock.name));
        return { data, sourceLabel: "Remote JSON", warning: "" };
      } catch (error) {
        console.error("fetch remote failed", error);
        try {
          console.log("jsonp remote start");
          const data = await loadJsonp(remoteUrl);
          console.log("jsonp remote success", data.stocks?.map((stock) => stock.name));
          return { data, sourceLabel: "Remote JSONP", warning: "" };
        } catch (jsonpError) {
          console.error("jsonp remote failed", jsonpError);
        }
      }
    }

    try {
      const data = await fetchJson(withTimestamp("data.json"));
      console.log("loaded local data.json");
      return {
        data,
        sourceLabel: remoteUrl ? "Remote失敗 → Local fallback" : "Local data.json",
        warning: remoteUrl ? "Remote JSONの取得に失敗したため、data.jsonを表示しています" : ""
      };
    } catch (error) {
      console.error("data.json load failed", error);
      return { data: null, sourceLabel: "読み込み失敗", warning: "データを読み込めませんでした" };
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return await response.json();
  }

  function loadJsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `__stockScopeJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      let done = false;
      const cleanup = () => {
        delete window[callbackName];
        script.remove();
      };
      const finish = (handler, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        handler(value);
      };
      const timer = setTimeout(() => finish(reject, new Error("JSONP timeout")), 10000);
      window[callbackName] = (payload) => finish(resolve, payload);
      script.onerror = () => finish(reject, new Error("JSONP script error"));
      script.src = withParams(url, { callback: callbackName, t: Date.now() });
      document.body.appendChild(script);
    });
  }

  function render() {
    const stocks = getStocks();
    if (!state.stockCode && stocks.length) state.stockCode = stocks[0].code || stocks[0].name;

    text("#dashboardTitle", "StockScope");
    text("#dashboardMode", "");
    text("#dashboardDate", formatDateTime(read(dashboardData.meta, ["date", "lastUpdated", "最終更新日"], "--")));
    text("#targetCount", `${stocks.length}銘柄`);
    renderStatus();
    renderTabs(stocks);
    renderContent(stocks);
  }

  function renderTabs(stocks) {
    byId("scopeTabs").innerHTML = scopeOptions.map(([id, label]) => tabButton("scope", id, label, state.scope)).join("");
    byId("periodTabs").innerHTML = periodOptions.map(([id, label]) => tabButton("period", id, label, state.period)).join("");

    const stockTabs = byId("stockTabs");
    stockTabs.hidden = state.scope !== "individual";
    stockTabs.innerHTML = stocks.map((stock) => `
      <button class="stock-tab" type="button" aria-selected="${sameStock(stock, state.stockCode)}" data-stock="${escapeAttr(stock.code || stock.name)}">
        ${escapeHtml(stock.shortName || stock.name)}
      </button>
    `).join("");

    byId("scopeTabs").querySelectorAll("[data-scope]").forEach((button) => {
      button.addEventListener("click", () => {
        state.scope = button.dataset.scope;
        if (state.scope === "individual" && !state.stockCode && stocks.length) state.stockCode = stocks[0].code || stocks[0].name;
        render();
      });
    });
    byId("periodTabs").querySelectorAll("[data-period]").forEach((button) => {
      button.addEventListener("click", () => {
        state.period = button.dataset.period;
        render();
      });
    });
    stockTabs.querySelectorAll("[data-stock]").forEach((button) => {
      button.addEventListener("click", () => {
        state.stockCode = button.dataset.stock;
        render();
      });
    });
  }

  function tabButton(type, id, label, active) {
    return `<button class="tab-button ${type}-tab-button" type="button" aria-selected="${id === active}" data-${type}="${id}">${escapeHtml(label)}</button>`;
  }

  function renderContent(stocks) {
    const content = byId("content");
    const stock = stocks.find((item) => sameStock(item, state.stockCode)) || stocks[0];
    if (state.scope === "overall" && state.period === "daily") content.innerHTML = renderOverallDaily(stocks);
    if (state.scope === "overall" && state.period === "weekly") content.innerHTML = renderOverallWeekly(stocks);
    if (state.scope === "overall" && state.period === "monthly") content.innerHTML = renderOverallMonthly(stocks);
    if (state.scope === "individual" && state.period === "daily") content.innerHTML = stock ? renderIndividualDaily(stock) : emptyCard("日次データがありません");
    if (state.scope === "individual" && state.period === "weekly") content.innerHTML = stock ? renderIndividualWeekly(stock) : emptyCard("週次レビューはまだありません");
    if (state.scope === "individual" && state.period === "monthly") content.innerHTML = stock ? renderIndividualMonthly(stock) : emptyCard("月次データはまだありません");
  }

  function renderOverallDaily(stocks) {
    const summary = dashboardData.summary || {};
    const cautions = cautionStocks(stocks);
    return [
      conclusionCard(actionText(summary, stocks), read(summary, ["overallPolicy", "全体方針"], overallConclusion(stocks))),
      dailyStockSummary(stocks),
      cautions.length ? tagCard("alert", "要注意銘柄", cautions.map((stock) => stock.name), "red") : "",
      tagCard("info", "主な理由", overallReasons(stocks, summary), "green"),
      tagCard("eye", "今後見るポイント", overallWatchPoints(stocks, summary), "green"),
      tagCard("alert", "方針変更トリガー", stocks.flatMap((stock) => list(stock.policyTriggers || stock.triggers)), "orange")
    ].filter(Boolean).join("");
  }

  function renderOverallWeekly(stocks) {
    const reviews = weeklyReviews();
    const cautions = weeklyCautionStocks(stocks, reviews);
    return [
      conclusionCard(read(dashboardData.summary, ["needAction", "actionRequired", "今日動く必要"], "なし"), read(dashboardData.summary, ["overallPolicy", "全体方針"], overallConclusion(stocks))),
      weeklyStockSummary(stocks, reviews, "来週方針"),
      cautions.length ? tagCard("alert", "要注意銘柄", cautions.map((stock) => stock.name), "red") : "",
      reviews.length ? reviewCard("target", "今週の予想・答え合わせ", reviews, "weekly") : emptyCard("週次レビューはまだありません", "target"),
      tagCard("info", "主な理由", weeklyReasons(stocks, reviews), "green"),
      tagCard("eye", "来週見るポイント", nextWatchPoints(stocks, reviews, "weekly"), "green"),
      tagCard("alert", "方針変更トリガー", stocks.flatMap((stock) => list(stock.policyTriggers || stock.triggers)), "orange"),
      nextPolicyCard("flag", "来週方針", fallbackList(reviews.map((review) => nextPolicy(review, "weekly")), stocks.map(conclusion)))
    ].filter(Boolean).join("");
  }

  function renderOverallMonthly(stocks) {
    const reviews = monthlyReviews();
    if (!reviews.length) return emptyCard("月次データはまだありません", "calendarMonth");
    const cautions = monthlyCautionStocks(stocks, reviews);
    return [
      conclusionCard(read(dashboardData.summary, ["monthlyAction", "needAction", "actionRequired"], "なし"), read(dashboardData.summary, ["monthlyConclusion", "overallPolicy", "全体方針"], overallConclusion(stocks))),
      monthlyStockSummary(stocks, reviews),
      cautions.length ? tagCard("alert", "要注意銘柄", cautions.map((stock) => stock.name), "red") : "",
      reviewCard("target", "今月の見立て・答え合わせ", reviews, "monthly"),
      metricCard("calendarMonth", "月間サマリー", monthlySummaryRows(reviews)),
      tagCard("info", "主な理由", reviewReasons(reviews), "green"),
      tagCard("eye", "来月見るポイント", nextWatchPoints(stocks, reviews, "monthly"), "green"),
      tagCard("alert", "方針変更トリガー", reviews.flatMap((review) => list(read(review, ["policyTriggers", "triggers", "方針変更トリガー"], ""))), "orange"),
      nextPolicyCard("flag", "来月方針", reviews.map((review) => nextPolicy(review, "monthly")))
    ].filter(Boolean).join("");
  }

  function renderIndividualDaily(stock) {
    return [
      stockHeader(stock),
      conclusionCard(actionRequired(stock), conclusion(stock)),
      priceSummary(stock),
      infoCard("document", "今日の見立て", read(stock, ["todayJudgement", "decisionText", "judgement", "今日時点の判断"], "")),
      tagCard("info", "主な理由", decisionRows(stock), "green"),
      newsCard(stock),
      tagCard("eye", "今後見るポイント", list(stock.watchPoints), "green"),
      tagCard("alert", "方針変更トリガー", list(stock.policyTriggers || stock.triggers), "orange"),
      infoCard("clock", "最短見通し", read(stock, ["shortOutlook", "shortTermView", "最短見通し"], ""))
    ].filter(Boolean).join("");
  }

  function renderIndividualWeekly(stock) {
    const review = reviewForStock(weeklyReviews(), stock);
    if (!review) return stockHeader(stock) + emptyCard("週次レビューはまだありません", "calendar");
    return [
      stockHeader(stock),
      conclusionCard(read(review, ["actionRequired", "needAction", "今日動く必要"], actionRequired(stock)), nextPolicy(review, "weekly") || conclusion(stock)),
      metricCard("calendar", "週次サマリー", [
        ["対象週", read(review, ["week", "週"], "")],
        ["想定レンジ", rangeText(read(review, ["forecastRange", "想定レンジ"], ""), read(review, ["forecastRangeLow", "想定レンジ下限"], ""), read(review, ["forecastRangeHigh", "想定レンジ上限"], ""))],
        ["実際の値動き", actualMove(review)],
        ["来週方針", nextPolicy(review, "weekly") || conclusion(stock)]
      ]),
      reviewCard("target", "今週の予想・答え合わせ", [review], "weekly"),
      tagCard("info", "主な理由", fallbackList(reviewReasons([review]), [stock.oneLine, stock.summaryComment, stock.todayJudgement]), "green"),
      tagCard("eye", "来週見るポイント", nextWatchPoints([stock], [review], "weekly"), "green"),
      tagCard("alert", "方針変更トリガー", fallbackList(read(review, ["policyTriggers", "triggers", "方針変更トリガー"], ""), stock.policyTriggers || stock.triggers), "orange"),
      infoCard("flag", "来週方針", nextPolicy(review, "weekly") || conclusion(stock))
    ].filter(Boolean).join("");
  }

  function renderIndividualMonthly(stock) {
    const review = reviewForStock(monthlyReviews(), stock);
    if (!review) return stockHeader(stock) + emptyCard("月次データはまだありません", "calendarMonth");
    return [
      stockHeader(stock),
      conclusionCard(read(review, ["actionRequired", "needAction", "monthlyAction"], actionRequired(stock)), nextPolicy(review, "monthly") || conclusion(stock)),
      metricCard("calendarMonth", "月間サマリー", [
        ["対象月", read(review, ["month", "targetMonth", "対象月"], "")],
        ["実際の値動き", actualMove(review)],
        ["来月方針", nextPolicy(review, "monthly")]
      ]),
      reviewCard("target", "今月の見立て・答え合わせ", [review], "monthly"),
      tagCard("info", "主な理由", reviewReasons([review]), "green"),
      materialsCard(review),
      tagCard("eye", "来月見るポイント", nextWatchPoints([stock], [review], "monthly"), "green"),
      tagCard("alert", "方針変更トリガー", list(read(review, ["policyTriggers", "triggers", "方針変更トリガー"], "")), "orange"),
      infoCard("flag", "来月方針", nextPolicy(review, "monthly"))
    ].filter(Boolean).join("");
  }

  function conclusionCard(action, conclusionText) {
    return `
      <section class="card hero-card">
        <div class="card-header">${iconBadge("scale")}<h2>結論</h2></div>
        <div class="metric-grid">
          ${metric("対応の必要性", action || "なし")}
          ${metric("現在の結論", conclusionText || "未設定")}
        </div>
      </section>
    `;
  }

  function dailyStockSummary(stocks) {
    if (!stocks.length) return "";
    return `
      <section class="card summary-card summary-card--daily terminal-summary-card terminal-summary-card--daily">
        <div class="card-header">${iconBadge("table")}<h2>銘柄サマリー</h2></div>
        <div class="summary-list summary-list--daily terminal-summary-list" data-summary-visibility-period="daily">
          ${stocks.map((stock) => {
            const tone = changeTone(`${formatYen(stock.change)} ${formatPercent(stock.changeRate)}`);
            return `
              <article class="summary-row summary-row--daily">
                <div class="summary-main">
                  <div class="summary-heading-line">
                    <strong class="summary-name">${escapeHtml(stock.name)}</strong>
                    ${summaryBadge(conclusion(stock))}
                  </div>
                </div>
                <div class="terminal-daily-values">
                  <span class="summary-price">${escapeHtml(formatPrice(stock.price))}</span>
                  <span class="summary-change is-${tone}">${escapeHtml(formatYen(stock.change))}</span>
                  <span class="summary-change is-${tone}">${escapeHtml(formatPercent(stock.changeRate))}</span>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function weeklyStockSummary(stocks, reviews, policyLabel) {
    if (!reviews.length) return "";
    return summaryMiniCards("table", "銘柄サマリー", stocks.map((stock) => {
      const review = reviewForStock(reviews, stock);
      if (!review) return "";
      return `
        <article class="summary-row summary-row--weekly">
          <div class="summary-main">
            <strong class="summary-name">${escapeHtml(stock.name)}</strong>
            <div class="summary-meta">
              ${summaryBadge(`一致度：${valueOrDash(matchLevel(review))}`, matchTone(matchLevel(review)))}
              ${summaryBadge(nextPolicy(review, "weekly") || conclusion(stock))}
            </div>
            <p class="summary-note">${escapeHtml(valueOrDash(actualMove(review)))}</p>
            <p class="summary-subnote">${escapeHtml(policyLabel)}：${escapeHtml(valueOrDash(nextPolicy(review, "weekly") || conclusion(stock)))}</p>
          </div>
        </article>
      `;
    }).filter(Boolean));
  }

  function monthlyStockSummary(stocks, reviews) {
    return summaryMiniCards("table", "銘柄サマリー", stocks.map((stock) => {
      const review = reviewForStock(reviews, stock);
      if (!review) return "";
      return `
        <article class="summary-row summary-row--weekly">
          <div class="summary-main">
            <strong class="summary-name">${escapeHtml(stock.name)}</strong>
            <div class="summary-meta">
              ${summaryBadge(`一致度：${valueOrDash(matchLevel(review))}`, matchTone(matchLevel(review)))}
              ${summaryBadge(nextPolicy(review, "monthly") || conclusion(stock))}
            </div>
            <p class="summary-note">${escapeHtml(valueOrDash(actualMove(review)))}</p>
          </div>
        </article>
      `;
    }).filter(Boolean));
  }

  function summaryMiniCards(iconName, title, rows) {
    if (!rows.length) return "";
    return `<section class="card summary-card"><div class="card-header">${iconBadge(iconName)}<h2>${escapeHtml(title)}</h2></div><div class="summary-list">${rows.join("")}</div></section>`;
  }

  function reviewCard(iconName, title, reviews, type) {
    const blocks = reviews.map((review) => {
      const rows = [
        [type === "monthly" ? "見立て" : "今週の予想", forecastText(review, type)],
        ["実際の値動き", actualMove(review)],
        ["一致度", matchLevel(review)],
        ["当たった点", read(review, ["matchedPoints", "hitPoints", "当たった点"], "")],
        ["外れた点", read(review, ["missedPoints", "外れた点"], "")],
        ["次回に活かす点", read(review, ["nextImprovement", "nextImprovePoints", "次回に活かす点"], "")]
      ].filter(([, value]) => hasValue(value));
      if (!rows.length) return "";
      return `<div class="reflection-block">${hasValue(reviewName(review)) ? `<h3>${escapeHtml(reviewName(review))}</h3>` : ""}<div class="metric-grid">${rows.map(([label, value]) => metric(label, value)).join("")}</div></div>`;
    }).filter(Boolean);
    if (!blocks.length) return "";
    return `<section class="card"><div class="card-header">${iconBadge(iconName)}<h2>${escapeHtml(title)}</h2></div><div class="reflection-grid">${blocks.join("")}</div></section>`;
  }

  function priceSummary(stock) {
    const tone = changeTone(`${formatYen(stock.change)} ${formatPercent(stock.changeRate)}`);
    return `
      <section class="card">
        <div class="card-header">${iconBadge("chart")}<h2>株価サマリー</h2></div>
        <div class="terminal-daily-values terminal-daily-values--solo">
          <span class="summary-price">${escapeHtml(formatPrice(stock.price))}</span>
          <span class="summary-change is-${tone}">${escapeHtml(formatYen(stock.change))}</span>
          <span class="summary-change is-${tone}">${escapeHtml(formatPercent(stock.changeRate))}</span>
        </div>
      </section>
    `;
  }

  function stockHeader(stock) {
    return `
      <section class="card hero-card">
        <div class="card-header">
          ${iconBadge("building")}
          <div>
            <h2>${escapeHtml(stock.name)} <span class="label">${escapeHtml(stock.code || "--")}</span></h2>
            <div class="chip-row">${summaryBadge(conclusion(stock))}${hasValue(stock.confidence) ? summaryBadge(`自信度：${stock.confidence}`, "neutral") : ""}</div>
          </div>
        </div>
        ${hasValue(stock.oneLine || stock.summaryComment) ? `<p class="lead">${escapeHtml(stock.oneLine || stock.summaryComment)}</p>` : ""}
      </section>
    `;
  }

  function metricCard(iconName, title, rows) {
    const filtered = rows.filter(([, value]) => hasValue(value));
    if (!filtered.length) return "";
    return `<section class="card"><div class="card-header">${iconBadge(iconName)}<h2>${escapeHtml(title)}</h2></div><div class="metric-grid">${filtered.map(([label, value]) => metric(label, value)).join("")}</div></section>`;
  }

  function infoCard(iconName, title, body) {
    if (!hasValue(body)) return "";
    return `<section class="card"><div class="card-header">${iconBadge(iconName)}<h2>${escapeHtml(title)}</h2></div><p class="compact-text">${escapeHtml(body)}</p></section>`;
  }

  function tagCard(iconName, title, items, tone = "green") {
    const values = list(items);
    if (!values.length) return "";
    return `<section class="card"><div class="card-header">${iconBadge(iconName, tone)}<h2>${escapeHtml(title)}</h2></div><div class="tag-list">${values.map((item) => `<span class="tag ${tone}">${escapeHtml(item)}</span>`).join("")}</div></section>`;
  }

  function newsCard(stock) {
    const news = Array.isArray(stock.relatedNews || stock.news) ? (stock.relatedNews || stock.news) : [];
    const visible = news.filter((item) => hasValue(read(item, ["title", "headline", "見出し"], "")) || hasValue(read(item, ["content", "内容"], "")));
    if (!visible.length) return "";
    return `
      <section class="card">
        <div class="card-header">${iconBadge("news")}<h2>関連ニュース</h2></div>
        <div class="news-grid">
          ${visible.map((item) => {
            const source = read(item, ["source", "ソース"], "");
            const title = read(item, ["title", "headline", "見出し"], "ニュース");
            return `<article class="news-card"><h3>${escapeHtml(title)}</h3>${hasValue(read(item, ["content", "内容"], "")) ? `<p>${escapeHtml(read(item, ["content", "内容"], ""))}</p>` : ""}<p class="footer-note">${escapeHtml([read(item, ["impact", "影響"], ""), source].filter(hasValue).join(" / "))}</p></article>`;
          }).join("")}
        </div>
      </section>
    `;
  }

  function materialsCard(review) {
    const strong = list(read(review, ["strongMaterials", "positiveFactors", "強材料"], ""));
    const weak = list(read(review, ["weakMaterials", "negativeFactors", "弱材料"], ""));
    if (!strong.length && !weak.length) return "";
    return `<section class="card"><div class="card-header">${iconBadge("scale")}<h2>強弱材料</h2></div><div class="reflection-grid">${strong.length ? `<div class="reflection-block"><h3>強材料</h3><div class="tag-list">${strong.map((item) => `<span class="tag green">${escapeHtml(item)}</span>`).join("")}</div></div>` : ""}${weak.length ? `<div class="reflection-block"><h3>弱材料</h3><div class="tag-list">${weak.map((item) => `<span class="tag orange">${escapeHtml(item)}</span>`).join("")}</div></div>` : ""}</div></section>`;
  }

  function nextPolicyCard(iconName, title, values) {
    const items = list(values);
    if (!items.length) return "";
    return infoCard(iconName, title, items.join(" / "));
  }

  function emptyCard(message, iconName = "info") {
    return `<section class="card"><div class="card-header">${iconBadge(iconName)}<h2>${escapeHtml(message)}</h2></div><p class="empty-note">${escapeHtml(message)}</p></section>`;
  }

  function metric(label, value) {
    if (!hasValue(value)) return "";
    return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
  }

  function summaryBadge(value, explicitTone = "") {
    if (!hasValue(value)) return "";
    return `<span class="summary-badge is-${explicitTone || badgeTone(value)}">${escapeHtml(value)}</span>`;
  }

  function iconBadge(name = "info", tone = "green") {
    const icons = {
      alert: '<path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>',
      building: '<path d="M4 21V5a2 2 0 0 1 2-2h9v18"></path><path d="M15 8h3a2 2 0 0 1 2 2v11"></path><path d="M8 7h3"></path><path d="M8 11h3"></path><path d="M8 15h3"></path>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 11h18"></path>',
      calendarMonth: '<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M8 2v4"></path><path d="M16 2v4"></path><path d="M3 10h18"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path>',
      chart: '<path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 16v-5"></path><path d="M12 16V8"></path><path d="M16 16v-3"></path>',
      clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path>',
      document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path>',
      eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
      flag: '<path d="M5 22V4"></path><path d="M5 4h11l-1.5 4L16 12H5"></path>',
      info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7h.01"></path>',
      news: '<path d="M4 5h14a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V5z"></path><path d="M8 9h8"></path><path d="M8 13h8"></path><path d="M8 17h4"></path>',
      scale: '<path d="M12 3v18"></path><path d="M5 7h14"></path><path d="M6 7l-4 7h8L6 7z"></path><path d="M18 7l-4 7h8l-4-7z"></path>',
      table: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18"></path><path d="M9 4v16"></path><path d="M15 4v16"></path>',
      target: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>'
    };
    return `<span class="icon-badge ${tone}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg></span>`;
  }

  function getStocks() {
    return Array.isArray(dashboardData?.stocks) ? dashboardData.stocks.filter(Boolean) : [];
  }

  function weeklyReviews() {
    return normalizeReviews(dashboardData?.weeklyReviews || dashboardData?.weeklyReview || []);
  }

  function monthlyReviews() {
    return normalizeReviews(dashboardData?.monthlyReviews || dashboardData?.monthlyReview || []);
  }

  function normalizeReviews(raw) {
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return rows.filter((review) => review && [
      reviewName(review),
      actualMove(review),
      matchLevel(review),
      nextPolicy(review, "weekly"),
      nextPolicy(review, "monthly")
    ].some(hasValue));
  }

  function reviewForStock(reviews, stock) {
    return reviews.find((review) => {
      const code = read(review, ["code", "証券コード"], "");
      const name = reviewName(review);
      return (stock.code && String(code) === String(stock.code)) || (stock.name && name === stock.name);
    });
  }

  function sameStock(stock, key) {
    return String(stock.code || stock.name) === String(key);
  }

  function cautionStocks(stocks) {
    return stocks.filter((stock) => `${conclusion(stock)} ${actionRequired(stock)}`.includes("要注意"));
  }

  function weeklyCautionStocks(stocks, reviews) {
    return stocks.filter((stock) => {
      const review = reviewForStock(reviews, stock);
      return `${conclusion(stock)} ${matchLevel(review)} ${nextPolicy(review, "weekly")}`.includes("要注意") ||
        String(matchLevel(review)).includes("低");
    });
  }

  function monthlyCautionStocks(stocks, reviews) {
    return stocks.filter((stock) => {
      const review = reviewForStock(reviews, stock);
      return `${conclusion(stock)} ${matchLevel(review)} ${nextPolicy(review, "monthly")}`.includes("要注意") ||
        String(matchLevel(review)).includes("低");
    });
  }

  function actionText(summary, stocks) {
    return read(summary, ["needAction", "actionRequired", "今日動く必要"], stocks.some((stock) => actionRequired(stock).includes("あり")) ? "あり" : "なし");
  }

  function overallConclusion(stocks) {
    const conclusions = stocks.map(conclusion).filter(hasValue);
    return conclusions.find((item) => item.includes("要注意")) || conclusions[0] || "未設定";
  }

  function overallReasons(stocks, summary) {
    return fallbackList(read(summary, ["reason", "mainReasons", "主な理由"], ""), stocks.map((stock) => stock.oneLine || stock.summaryComment || stock.newsTrend));
  }

  function overallWatchPoints(stocks, summary) {
    return fallbackList(read(summary, ["commonCheckpoints", "共通チェックポイント"], ""), stocks.flatMap((stock) => list(stock.watchPoints)));
  }

  function reviewReasons(reviews) {
    return reviews.flatMap((review) => list(read(review, ["mainReasons", "reason", "matchedPoints", "missedPoints", "主な理由", "当たった点", "外れた点"], "")));
  }

  function weeklyReasons(stocks, reviews) {
    return fallbackList(reviewReasons(reviews), stocks.map((stock) => stock.oneLine || stock.summaryComment || stock.newsTrend));
  }

  function nextWatchPoints(stocks, reviews, type) {
    const key = type === "monthly" ? ["nextMonthWatchPoints", "watchPoints", "来月見るポイント"] : ["nextWeekWatchPoints", "watchPoints", "来週見るポイント"];
    return reviews.flatMap((review) => list(read(review, key, ""))).concat(stocks.flatMap((stock) => list(stock.watchPoints)));
  }

  function monthlySummaryRows(reviews) {
    return [
      ["対象月", reviews.map((review) => read(review, ["month", "targetMonth", "対象月"], "")).filter(hasValue).join(" / ")],
      ["実際の値動き", reviews.map(actualMove).filter(hasValue).join(" / ")],
      ["来月方針", reviews.map((review) => nextPolicy(review, "monthly")).filter(hasValue).join(" / ")]
    ];
  }

  function decisionRows(stock) {
    if (Array.isArray(stock.decisionDetails) && stock.decisionDetails.length) {
      return stock.decisionDetails.map((item) => `${item.label}: ${item.value}`);
    }
    const breakdown = stock.decisionBreakdown || {};
    return [
      hasValue(breakdown.buy) ? `買い増し: ${breakdown.buy}` : "",
      hasValue(breakdown.takeProfit) ? `利確: ${breakdown.takeProfit}` : "",
      hasValue(breakdown.hold) ? `放置: ${breakdown.hold}` : ""
    ].filter(hasValue);
  }

  function forecastText(review, type) {
    return type === "monthly"
      ? read(review, ["monthlyForecast", "monthlyView", "forecast", "今月の見立て"], "")
      : read(review, ["mondayForecast", "weeklyForecast", "forecast", "月曜予想", "今週の予想"], "");
  }

  function actualMove(review) {
    return read(review, ["actualMove", "actualMovement", "weeklyResult", "monthlyMove", "実際の値動き", "月間変化"], "");
  }

  function matchLevel(review) {
    return read(review, ["matchLevel", "一致度"], "");
  }

  function nextPolicy(review, type) {
    return type === "monthly"
      ? read(review, ["nextMonthPolicy", "provisionalNextPolicy", "来月方針", "来月に向けた暫定方針"], "")
      : read(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週方針", "来週に向けた暫定方針"], "");
  }

  function reviewName(review) {
    return read(review, ["name", "stockName", "銘柄名"], "");
  }

  function conclusion(stock) {
    return read(stock, ["conclusion", "decision", "結論"], "未設定");
  }

  function actionRequired(stock) {
    return read(stock, ["actionRequired", "needAction", "todayAction", "今日動く必要"], "なし");
  }

  function rangeText(full, low, high) {
    if (hasValue(full)) return full;
    if (hasValue(low) && hasValue(high)) return `${low} 〜 ${high}`;
    return low || high || "";
  }

  function formatPrice(value) {
    const raw = valueOrDash(value);
    if (raw === "---" || raw.includes("円")) return raw;
    const number = Number(String(raw).replace(/,/g, ""));
    return Number.isFinite(number) ? `${number.toLocaleString("ja-JP")}円` : raw;
  }

  function formatYen(value) {
    const raw = valueOrDash(value);
    if (raw === "---" || raw.includes("円")) return raw;
    const number = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(number)) return raw;
    return `${number > 0 ? "+" : ""}${number.toLocaleString("ja-JP")}円`;
  }

  function formatPercent(value) {
    const raw = valueOrDash(value);
    if (raw === "---" || raw.includes("%")) return raw;
    const number = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(number)) return raw;
    return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
  }

  function badgeTone(value) {
    const raw = String(value || "");
    if (raw.includes("要注意") || raw.includes("低") || raw.includes("方針見直し")) return "danger";
    if (raw.includes("注意") || raw.includes("中") || raw.includes("利確")) return "warning";
    if (raw.includes("放置") || raw.includes("継続") || raw.includes("高")) return "main";
    return "neutral";
  }

  function matchTone(value) {
    const raw = String(value || "");
    if (raw.includes("低")) return "danger";
    if (raw.includes("中")) return "warning";
    if (raw.includes("高")) return "main";
    return "neutral";
  }

  function changeTone(value) {
    const raw = String(value || "");
    if (raw.includes("+") || raw.includes("＋")) return "up";
    if (raw.includes("-") || raw.includes("−") || raw.includes("－")) return "down";
    return "flat";
  }

  function list(value) {
    const source = Array.isArray(value) ? value : hasValue(value) ? String(value).split(/[\n｜|]/) : [];
    return source.map((item) => String(item).trim()).filter(hasValue);
  }

  function fallbackList(primary, fallback) {
    const primaryItems = list(primary);
    return primaryItems.length ? primaryItems : list(fallback);
  }

  function read(object, keys, fallback = "") {
    for (const key of keys) {
      const value = object?.[key];
      if (hasValue(value)) return value;
    }
    return fallback;
  }

  function hasValue(value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    const raw = String(value).trim();
    return Boolean(raw && raw !== "---" && raw !== "--" && raw !== "未入力" && raw !== "undefined");
  }

  function valueOrDash(value) {
    return hasValue(value) ? String(value).trim() : "---";
  }

  function formatDateTime(value) {
    return hasValue(value) ? String(value).replace(/-/g, "/") : "--";
  }

  function renderStatus() {
    const status = byId("dataStatus");
    if (!DEBUG_MODE) {
      status.hidden = true;
      status.innerHTML = "";
      return;
    }
    status.hidden = false;
    status.classList.toggle("is-warning", Boolean(dataSource.warning));
    status.innerHTML = `<span>データ取得元：${escapeHtml(dataSource.label)}</span>${dataSource.warning ? `<small>${escapeHtml(dataSource.warning)}</small>` : ""}`;
  }

  function renderLoadError() {
    text("#dashboardTitle", "StockScope");
    text("#dashboardDate", "--");
    text("#targetCount", "0銘柄");
    byId("scopeTabs").innerHTML = "";
    byId("periodTabs").innerHTML = "";
    byId("stockTabs").innerHTML = "";
    byId("content").innerHTML = `<p class="error">データを読み込めませんでした</p>`;
  }

  function withTimestamp(url) {
    return withParams(url, { t: Date.now() });
  }

  function withParams(url, params) {
    const query = Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function text(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }
})();