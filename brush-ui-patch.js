(() => {
  let data = null;
  let applying = false;

  injectBrushStyles();
  document.addEventListener("DOMContentLoaded", initBrushUi);

  async function initBrushUi() {
    setBrand();
    data = await loadBrushData();
    document.addEventListener("click", () => window.setTimeout(applyBrushUi, 0));
    window.setTimeout(applyBrushUi, 1400);
  }

  async function loadBrushData() {
    const config = window.STOCK_DASHBOARD_CONFIG || {};
    const remoteUrl = typeof config.REMOTE_DATA_URL === "string" ? config.REMOTE_DATA_URL.trim() : "";

    if (config.USE_REMOTE_DATA === true && remoteUrl) {
      try {
        const response = await fetch(addTimestamp(remoteUrl), { cache: "no-store" });
        if (response.ok) return await response.json();
      } catch (error) {
        console.error("brush ui remote fetch failed", error);
      }

      try {
        return await loadJsonp(remoteUrl);
      } catch (error) {
        console.error("brush ui remote jsonp failed", error);
      }
    }

    try {
      const response = await fetch(addTimestamp("data.json"), { cache: "no-store" });
      if (response.ok) return await response.json();
    } catch (error) {
      console.error("brush ui local data load failed", error);
    }

    return null;
  }

  function loadJsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `__stockScopeBrush_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

  function applyBrushUi() {
    setBrand();
    normalizeTabLabels();
    replaceCardIcons();

    if (!data || applying) return;

    const scope = selectedValue(".scope-tabs [aria-selected='true']", "scope");
    const period = selectedValue(".period-tabs [aria-selected='true']", "period");
    const content = document.getElementById("content");
    if (!content) return;

    const stocks = getStocks();
    if (scope === "overall") {
      applying = true;
      content.innerHTML = renderOverall(period, stocks);
      content.dataset.brushUi = `overall-${period}`;
      applying = false;
      replaceCardIcons();
      return;
    }

    if (scope !== "individual" || !["weekly", "monthly"].includes(period)) return;

    const stockCode = selectedValue(".stock-tabs [aria-selected='true']", "stock");
    const stock = stocks.find((item) => String(item.code) === String(stockCode)) || stocks[0];
    if (!stock) return;

    applying = true;
    content.innerHTML = period === "weekly" ? renderIndividualWeekly(stock) : renderIndividualMonthly(stock);
    content.dataset.brushUi = period;
    applying = false;
    replaceCardIcons();
  }

  function renderOverall(period, stocks) {
    if (period === "weekly") return renderOverallWeekly(stocks);
    if (period === "monthly") return renderOverallMonthly(stocks);
    return renderOverallDaily(stocks);
  }

  function renderOverallDaily(stocks) {
    const summary = overallSummary(stocks);
    const caution = cautionStocks(stocks);
    const reasons = dailyReasons(stocks, summary).slice(0, 4);
    const watchPoints = uniqueList(stocks.flatMap((stock) => toList(stock.watchPoints))).slice(0, 5);
    const triggers = uniqueList(stocks.flatMap((stock) => toList(stock.policyTriggers || stock.triggers))).slice(0, 5);

    return [
      renderHeroCard("対応の必要性", summary.action, summary.reason, toneForAction(summary.action), "shield"),
      renderInfoCard("現在の結論", summary.policy, "scale"),
      caution.length ? renderTagCard("要注意銘柄", caution.map((stock) => stock.name), "red", "alert") : renderInfoCard("要注意銘柄", "要注意銘柄なし", "alert"),
      reasons.length ? renderTagCard("主な理由", reasons, "green", "info") : "",
      renderStockSummaryCard("銘柄サマリー", stocks.map((stock) => [
        stock.name,
        conclusion(stock),
        text(stock.price, "---"),
        text(stock.changeRate, "---")
      ]), "list"),
      watchPoints.length ? renderTagCard("見るポイント", watchPoints, "green", "eye") : "",
      triggers.length ? renderTagCard("方針変更トリガー", triggers, "orange", "alert") : ""
    ].filter(Boolean).join("");
  }

  function renderOverallWeekly(stocks) {
    const reviews = weeklyReviews();
    const caution = weeklyCautionStocks(stocks, reviews);
    const reasons = uniqueList(reviews.flatMap((review) => [
      read(review, ["actualMove", "weeklyResult", "実際の値動き"], ""),
      read(review, ["missedPoints", "外れた点"], ""),
      read(review, ["matchedPoints", "hitPoints", "当たった点"], "")
    ])).slice(0, 4);
    const watchPoints = uniqueList([
      ...reviews.map((review) => read(review, ["nextImprovement", "nextImprovePoints", "次回に活かす点"], "")),
      ...stocks.flatMap((stock) => toList(stock.watchPoints))
    ]).slice(0, 5);
    const triggers = uniqueList(stocks.flatMap((stock) => toList(stock.policyTriggers || stock.triggers))).slice(0, 5);
    const action = caution.length ? "来週は要注意" : "様子見";

    return [
      renderHeroCard("対応の必要性", action, reviews.length ? "今週の振り返りと来週方針を確認します。" : "週次レビューはまだありません。", toneForAction(action), "shield"),
      renderInfoCard("現在の結論", makeOverallPolicy(stocks), "scale"),
      caution.length ? renderTagCard("要注意銘柄", caution.map((stock) => stock.name), "red", "alert") : renderInfoCard("要注意銘柄", "要注意銘柄なし", "alert"),
      reasons.length ? renderTagCard("主な理由", reasons, "green", "info") : renderInfoCard("主な理由", "週次レビューはまだありません", "info"),
      reviews.length ? renderStockSummaryCard("銘柄サマリー", stocks.map((stock) => {
        const review = weeklyReviewFor(stock);
        return [
          stock.name,
          review ? read(review, ["actualMove", "weeklyResult", "実際の値動き"], "---") : "---",
          review ? (read(review, ["actualRange", "実際レンジ"], "") || rangeText(read(review, ["actualRangeLow", "実際レンジ下限"], ""), read(review, ["actualRangeHigh", "実際レンジ上限"], "")) || "---") : "---",
          review ? read(review, ["matchLevel", "一致度"], "---") : "---",
          review ? read(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], conclusion(stock)) : conclusion(stock)
        ];
      }), "list") : renderEmptySectionCard("銘柄サマリー", "週次レビューはまだありません", "list"),
      watchPoints.length ? renderTagCard("見るポイント", watchPoints, "green", "eye") : "",
      triggers.length ? renderTagCard("方針変更トリガー", triggers, "orange", "alert") : ""
    ].filter(Boolean).join("");
  }

  function renderOverallMonthly(stocks) {
    const reviews = monthlyReviews();
    const summary = overallSummary(stocks);
    const caution = cautionStocks(stocks);
    const watchPoints = uniqueList(stocks.flatMap((stock) => toList(stock.watchPoints))).slice(0, 5);
    const triggers = uniqueList(stocks.flatMap((stock) => toList(stock.policyTriggers || stock.triggers))).slice(0, 5);

    return [
      renderHeroCard("対応の必要性", "月次データはまだありません", "月次ログが整うまでは、月間変化や翌月方針を無理に日次データから作りません。", "neutral", "shield"),
      renderInfoCard("現在の結論", summary.policy, "scale"),
      caution.length ? renderTagCard("要注意銘柄", caution.map((stock) => stock.name), "red", "alert") : renderInfoCard("要注意銘柄", "要注意銘柄なし", "alert"),
      renderInfoCard("主な理由", reviews.length ? "今月の総括データを表示します。" : "月次データはまだありません", "info"),
      reviews.length ? renderStockSummaryCard("銘柄サマリー", reviews.map((review) => [
        read(review, ["name", "stockName", "銘柄名"], "---"),
        read(review, ["monthlyMove", "月間変化", "月間の値動き"], "---"),
        read(review, ["monthlyTrend", "月間傾向"], "---"),
        read(review, ["nextMonthPolicy", "来月方針", "翌月方針"], "---")
      ]), "list") : renderEmptySectionCard("銘柄サマリー", "月次データはまだありません", "list"),
      watchPoints.length ? renderTagCard("見るポイント", watchPoints, "green", "eye") : "",
      triggers.length ? renderTagCard("方針変更トリガー", triggers, "orange", "alert") : ""
    ].filter(Boolean).join("");
  }

  function renderIndividualWeekly(stock) {
    const review = weeklyReviewFor(stock);
    if (!review) {
      return [
        renderStockHeader(stock, "週次レビュー"),
        renderEmptyCard("週次レビューはまだありません")
      ].join("");
    }

    const policy = read(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], conclusion(stock));
    const matchLevel = read(review, ["matchLevel", "一致度"], "");
    const action = weeklyAction(review, policy, matchLevel);
    const forecastRange = read(review, ["forecastRange", "想定レンジ"], "") || rangeText(read(review, ["forecastRangeLow", "想定レンジ下限"], ""), read(review, ["forecastRangeHigh", "想定レンジ上限"], ""));
    const actualRange = read(review, ["actualRange", "実際レンジ"], "") || rangeText(read(review, ["actualRangeLow", "実際レンジ下限"], ""), read(review, ["actualRangeHigh", "実際レンジ上限"], ""));

    return [
      renderStockHeader(stock, "週次レビュー", matchLevel ? [`一致度：${matchLevel}`] : []),
      renderHeroCard("対応の必要性", action, "", toneForAction(action), "shield"),
      renderInfoCard("現在の結論", policy, "scale"),
      renderMetricCard("週次サマリー", [
        ["週", read(review, ["week", "週"], "")],
        ["想定レンジ", forecastRange],
        ["実際レンジ", actualRange],
        ["一致度", matchLevel]
      ], "calendar"),
      renderInfoCard("実際の値動き", read(review, ["actualMove", "weeklyResult", "実際の値動き"], ""), "activity"),
      matchLevel ? renderHeroCard("一致度", matchLevel, "", toneForMatch(matchLevel), "target") : "",
      renderReflectionCard(review),
      renderHeroCard("来週に向けた暫定方針", policy, "", "orange", "flag")
    ].filter(Boolean).join("");
  }

  function renderIndividualMonthly(stock) {
    const review = monthlyReviewFor(stock);
    if (!review) {
      return [
        renderStockHeader(stock, "月次評価"),
        renderEmptyCard("月次データはまだありません")
      ].join("");
    }

    const nextPolicy = read(review, ["nextMonthPolicy", "来月方針", "翌月方針"], "");
    const conclusionText = read(review, ["monthlyConclusion", "conclusion", "月次結論", "結論"], nextPolicy || conclusion(stock));
    const action = read(review, ["actionRequired", "needAction", "monthlyAction", "対応の必要性"], "様子見");
    const monthlyRange = read(review, ["monthlyRange", "月間レンジ"], "") || rangeText(read(review, ["monthlyRangeLow", "月間レンジ下限"], ""), read(review, ["monthlyRangeHigh", "月間レンジ上限"], ""));
    const strong = toList(read(review, ["strongMaterials", "positiveFactors", "強材料"], ""));
    const weak = toList(read(review, ["weakMaterials", "negativeFactors", "weakFactors", "弱材料", "注意材料"], ""));
    const watchPoints = toList(read(review, ["watchPoints", "nextMonthWatchPoints", "来月見るポイント"], ""));
    const triggers = toList(read(review, ["policyTriggers", "triggers", "方針変更トリガー"], ""));

    return [
      renderStockHeader(stock, "月次評価"),
      renderHeroCard("対応の必要性", action, "", toneForAction(action), "shield"),
      renderInfoCard("現在の結論", conclusionText, "scale"),
      renderMetricCard("月間サマリー", [
        ["月間変化", read(review, ["monthlyMove", "月間の値動き"], "")],
        ["月間傾向", read(review, ["monthlyTrend", "月間傾向"], "")],
        ["月間変化率", read(review, ["monthlyChangeRate", "月間変化率"], "")],
        ["月間レンジ", monthlyRange]
      ], "calendar"),
      renderListOrTextCard("月間の主な理由", read(review, ["monthlyReasons", "mainReasons", "月間の主な理由"], ""), "green", "document"),
      strong.length || weak.length ? renderMaterialsCard(strong, weak) : "",
      nextPolicy ? renderHeroCard("来月方針", nextPolicy, "", "orange", "flag") : "",
      watchPoints.length ? renderTagCard("来月見るポイント", watchPoints, "green", "eye") : "",
      triggers.length ? renderTagCard("方針変更トリガー", triggers, "orange", "alert") : ""
    ].filter(Boolean).join("");
  }

  function renderStockHeader(stock, label, chips = []) {
    const chipItems = [label, ...chips].filter(hasValue);
    return `
      <section class="card hero-card">
        <div class="card-header brush-stock-header">
          ${iconBadge("building", "green")}
          <div>
            <h2>${escapeHtml(stock.name || "銘柄")} <span class="label">${escapeHtml(stock.code || "--")}</span></h2>
          </div>
          <div class="chip-row brush-header-chips">
            ${chipItems.map((item) => renderChip(item, toneForText(item))).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function renderHeroCard(title, result, body = "", tone = "green", icon = "info") {
    return `
      <section class="card hero-card">
        <div class="card-header">
          ${iconBadge(icon, tone)}
          <div>
            <h2>${escapeHtml(title)}</h2>
            <p class="hero-result">${escapeHtml(text(result, "未設定"))}</p>
          </div>
        </div>
        ${hasValue(body) ? `<p class="lead">${escapeHtml(body)}</p>` : ""}
      </section>
    `;
  }

  function renderInfoCard(title, body, icon = "info") {
    if (!hasValue(body)) return "";
    return `
      <section class="card">
        <div class="card-header">
          ${iconBadge(icon, "green")}
          <h2>${escapeHtml(title)}</h2>
        </div>
        <p class="compact-text">${escapeHtml(body)}</p>
      </section>
    `;
  }

  function renderMetricCard(title, rows, icon = "list") {
    const visibleRows = rows.filter(([, value]) => hasValue(value));
    if (!visibleRows.length) return "";
    return `
      <section class="card">
        <div class="card-header">
          ${iconBadge(icon, "green")}
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="metric-grid">
          ${visibleRows.map(([label, value]) => `
            <div class="metric">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(String(value))}</strong>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderListOrTextCard(title, raw, tone = "green", icon = "info") {
    const items = toList(raw);
    if (!items.length) return "";
    return items.length === 1 ? renderInfoCard(title, items[0], icon) : renderTagCard(title, items, tone, icon);
  }

  function renderTagCard(title, items, tone = "green", icon = "eye") {
    const list = toList(items);
    if (!list.length) return "";
    return `
      <section class="card">
        <div class="card-header">
          ${iconBadge(icon, tone)}
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="tag-list">${list.map((item) => `<span class="tag ${tone}">${escapeHtml(item)}</span>`).join("")}</div>
      </section>
    `;
  }

  function renderReflectionCard(review) {
    const blocks = [
      ["当たった点", read(review, ["matchedPoints", "hitPoints", "当たった点"], ""), "check-circle", "green"],
      ["外れた点", read(review, ["missedPoints", "外れた点"], ""), "x-circle", "red"],
      ["次回に活かす点", read(review, ["nextImprovement", "nextImprovePoints", "次回に活かす点"], ""), "lightbulb", "green"]
    ].filter(([, body]) => hasValue(body));
    if (!blocks.length) return "";

    return `
      <section class="card">
        <div class="card-header">
          ${iconBadge("check-list", "green")}
          <h2>予想の振り返り</h2>
        </div>
        <div class="reflection-grid">
          ${blocks.map(([title, body, icon, tone]) => `
            <div class="reflection-block ${tone}">
              <div class="reflection-title">${iconBadge(icon, tone)}<h3>${escapeHtml(title)}</h3></div>
              <p>${escapeHtml(body)}</p>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderMaterialsCard(strong, weak) {
    return `
      <section class="card">
        <div class="card-header">
          ${iconBadge("scale", "green")}
          <h2>強弱材料</h2>
        </div>
        <div class="brush-material-grid">
          ${strong.length ? `<div class="brush-material-column"><h3>強材料</h3><div class="tag-list">${strong.map((item) => `<span class="tag green">${escapeHtml(item)}</span>`).join("")}</div></div>` : ""}
          ${weak.length ? `<div class="brush-material-column weak"><h3>弱材料 / 注意材料</h3><div class="tag-list">${weak.map((item) => `<span class="tag orange">${escapeHtml(item)}</span>`).join("")}</div></div>` : ""}
        </div>
      </section>
    `;
  }

  function renderStockSummaryCard(title, rows, icon = "list") {
    const visibleRows = rows.filter((row) => Array.isArray(row) && row.some(hasValue));
    if (!visibleRows.length) return "";
    return `
      <section class="card">
        <div class="card-header">
          ${iconBadge(icon, "green")}
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="brush-summary-list">
          ${visibleRows.map((row) => `
            <div class="brush-summary-row">
              ${row.map((item, index) => `<span class="${index === 0 ? "name" : ""}">${escapeHtml(text(item, "---"))}</span>`).join("")}
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderEmptyCard(title) {
    return `<section class="card"><p class="empty-note"><strong>${escapeHtml(title)}</strong></p></section>`;
  }

  function renderEmptySectionCard(title, message, icon = "info") {
    return `
      <section class="card">
        <div class="card-header">
          ${iconBadge(icon, "green")}
          <h2>${escapeHtml(title)}</h2>
        </div>
        <p class="empty-note">${escapeHtml(message)}</p>
      </section>
    `;
  }

  function replaceCardIcons() {
    const map = {
      "対応の必要性": ["shield", "green"],
      "現在の結論": ["scale", "green"],
      "要注意銘柄": ["alert", "red"],
      "主な理由": ["info", "green"],
      "銘柄サマリー": ["list", "green"],
      "見るポイント": ["eye", "green"],
      "方針変更トリガー": ["alert", "orange"],
      "株価サマリー": ["activity", "green"],
      "関連ニュース": ["document", "green"],
      "最短見通し": ["flag", "orange"],
      "週次サマリー": ["calendar", "green"],
      "実際の値動き": ["activity", "green"],
      "一致度": ["target", "red"],
      "予想の振り返り": ["check-list", "green"],
      "来週に向けた暫定方針": ["flag", "orange"],
      "月間サマリー": ["calendar", "green"],
      "月間の主な理由": ["document", "green"],
      "強弱材料": ["scale", "green"],
      "来月方針": ["flag", "orange"],
      "来月見るポイント": ["eye", "green"]
    };

    document.querySelectorAll(".card").forEach((card) => {
      const heading = card.querySelector("h2")?.textContent?.trim();
      const badge = card.querySelector(".card-header .icon-badge");
      if (!heading || !badge || !map[heading]) return;
      const [icon, tone] = map[heading];
      badge.outerHTML = iconBadge(icon, tone);
    });
  }

  function normalizeTabLabels() {
    const labels = {
      overall: "全体",
      individual: "個別",
      daily: "日次",
      weekly: "週次",
      monthly: "月次"
    };
    document.querySelectorAll("[data-scope], [data-period]").forEach((button) => {
      const key = button.dataset.scope || button.dataset.period;
      if (labels[key]) button.textContent = labels[key];
    });
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
      read(review, ["code", "証券コード"], ""),
      read(review, ["name", "stockName", "銘柄名"], ""),
      read(review, ["actualMove", "weeklyResult", "実際の値動き"], ""),
      read(review, ["matchLevel", "一致度"], ""),
      read(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], "")
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
      read(review, ["code", "証券コード"], ""),
      read(review, ["name", "stockName", "銘柄名"], ""),
      read(review, ["monthlyConclusion", "conclusion", "月次結論", "結論"], ""),
      read(review, ["monthlyMove", "月間の値動き"], ""),
      read(review, ["nextMonthPolicy", "来月方針", "翌月方針"], "")
    ].some(hasValue));
  }

  function matchesStock(review, stock) {
    const code = String(read(review, ["code", "証券コード"], ""));
    const name = String(read(review, ["name", "stockName", "銘柄名"], ""));
    return (stock.code && code === String(stock.code)) || (stock.name && name === String(stock.name));
  }

  function getStocks() {
    return Array.isArray(data?.stocks) ? data.stocks.filter(Boolean) : [];
  }

  function overallSummary(stocks) {
    const actionStocks = stocks.filter((stock) => {
      const raw = `${read(stock, ["needAction", "todayAction", "今日動く必要"], "")} ${conclusion(stock)}`;
      return raw.includes("あり") || raw.includes("要注意") || raw.includes("方針見直し");
    });
    return {
      action: actionStocks.length ? "対応あり" : "対応なし",
      policy: makeOverallPolicy(stocks),
      reason: actionStocks.length
        ? `${actionStocks.map((stock) => stock.name).join("、")}を確認してください。`
        : "大きな対応が必要な銘柄はありません。"
    };
  }

  function makeOverallPolicy(stocks) {
    const conclusions = uniqueList(stocks.map(conclusion)).filter(hasValue);
    if (!conclusions.length) return "未設定";
    if (conclusions.some((item) => item.includes("要注意") || item.includes("方針見直し"))) return "一部要注意";
    if (conclusions.every((item) => item.includes("放置") || item.includes("継続"))) return "放置寄り";
    return conclusions.slice(0, 3).join(" / ");
  }

  function cautionStocks(stocks) {
    return stocks.filter((stock) => {
      const raw = `${conclusion(stock)} ${read(stock, ["needAction", "todayAction", "今日動く必要"], "")}`;
      return raw.includes("要注意") || raw.includes("方針見直し") || raw.includes("あり");
    });
  }

  function weeklyCautionStocks(stocks, reviews) {
    return stocks.filter((stock) => {
      const review = reviews.find((item) => matchesStock(item, stock));
      const raw = `${conclusion(stock)} ${review ? read(review, ["matchLevel", "一致度"], "") : ""} ${review ? read(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], "") : ""}`;
      return raw.includes("要注意") || raw.includes("方針見直し") || raw.includes("低");
    });
  }

  function dailyReasons(stocks, summary) {
    return uniqueList([
      summary.reason,
      ...stocks.map((stock) => read(stock, ["oneLine", "summaryComment", "一言"], "")),
      ...stocks.map((stock) => read(stock, ["newsTrend", "ニュース傾向"], ""))
    ]).filter(hasValue);
  }

  function weeklyAction(review, policy, matchLevel) {
    const raw = `${matchLevel} ${policy} ${read(review, ["actionRequired", "needAction", "今日動く必要"], "")}`;
    if (raw.includes("要注意") || raw.includes("方針見直し") || raw.includes("低") || raw.includes("あり")) return "来週は要注意";
    return "様子見";
  }

  function conclusion(stock) {
    return read(stock, ["conclusion", "decision", "結論"], "未設定");
  }

  function toneForAction(value) {
    const raw = String(value || "");
    if (raw.includes("要注意") || raw.includes("方針見直し") || raw.includes("あり")) return "red";
    if (raw.includes("なし") || raw.includes("様子見")) return "green";
    return "orange";
  }

  function toneForMatch(value) {
    const raw = String(value || "");
    if (raw.includes("低")) return "red";
    if (raw.includes("中")) return "orange";
    return "green";
  }

  function toneForText(value) {
    const raw = String(value || "");
    if (raw.includes("要注意") || raw.includes("低")) return "red";
    if (raw.includes("注意") || raw.includes("方針")) return "orange";
    return "green";
  }

  function read(object, keys, fallback = "") {
    for (const key of keys) {
      const value = object?.[key];
      if (hasValue(value)) return clean(value);
    }
    return fallback;
  }

  function toList(raw) {
    const source = Array.isArray(raw) ? raw : hasValue(raw) ? String(raw).split(/[\n｜|]/) : [];
    return source.map(clean).filter(hasValue);
  }

  function uniqueList(items) {
    const seen = new Set();
    const result = [];
    for (const item of items.flatMap((value) => Array.isArray(value) ? value : [value])) {
      const normalized = clean(item);
      if (!hasValue(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
    return result;
  }

  function rangeText(low, high) {
    const lowText = text(low, "");
    const highText = text(high, "");
    if (lowText && highText) return `${lowText} 〜 ${highText}`;
    return lowText || highText;
  }

  function renderChip(value, tone = "green") {
    return `<span class="chip ${tone}">${escapeHtml(text(value, "未設定"))}</span>`;
  }

  function selectedValue(selector, key) {
    return document.querySelector(selector)?.dataset?.[key] || "";
  }

  function hasValue(value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    const normalized = clean(String(value));
    return Boolean(normalized && normalized !== "未入力" && normalized !== "--" && normalized !== "---" && normalized !== "undefined");
  }

  function text(value, fallback = "") {
    return hasValue(value) ? clean(value) : fallback;
  }

  function clean(value) {
    return String(value ?? "").replace(/\s{2,}/g, " ").trim();
  }

  function setBrand() {
    document.title = "StockScope";
    const title = document.getElementById("dashboardTitle");
    const mode = document.getElementById("dashboardMode");
    if (title) title.textContent = "StockScope";
    if (mode) mode.textContent = "";
  }

  function addTimestamp(url) {
    return addParams(url, { t: Date.now() });
  }

  function addParams(url, params) {
    const query = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
  }

  function iconBadge(icon = "info", tone = "green") {
    const icons = {
      check: '<path d="M20 6L9 17l-5-5"></path>',
      shield: '<path d="M12 3l7 3v5c0 5-3.4 8.1-7 10-3.6-1.9-7-5-7-10V6l7-3z"></path><path d="M9 12l2 2 4-5"></path>',
      scale: '<path d="M12 3v18"></path><path d="M5 7h14"></path><path d="M6 7l-4 7h8L6 7z"></path><path d="M18 7l-4 7h8l-4-7z"></path>',
      alert: '<path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>',
      info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7h.01"></path>',
      eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
      list: '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>',
      activity: '<path d="M3 12h4l3 7 4-14 3 7h4"></path>',
      target: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>',
      flag: '<path d="M5 22V4"></path><path d="M5 4h11l-1.5 4L16 12H5"></path>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 11h18"></path>',
      building: '<path d="M4 21V5a2 2 0 0 1 2-2h9v18"></path><path d="M15 8h3a2 2 0 0 1 2 2v11"></path><path d="M8 7h3"></path><path d="M8 11h3"></path><path d="M8 15h3"></path>',
      document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path>',
      "check-list": '<path d="M9 6h11"></path><path d="M9 12h11"></path><path d="M9 18h11"></path><path d="M4 6l1 1 2-2"></path><path d="M4 12l1 1 2-2"></path><path d="M4 18l1 1 2-2"></path>',
      "check-circle": '<circle cx="12" cy="12" r="9"></circle><path d="M8 12l3 3 5-6"></path>',
      "x-circle": '<circle cx="12" cy="12" r="9"></circle><path d="M15 9l-6 6"></path><path d="M9 9l6 6"></path>',
      lightbulb: '<path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8 14a6 6 0 1 1 8 0c-.8.7-1 1.4-1 2H9c0-.6-.2-1.3-1-2z"></path>'
    };
    return `<span class="icon-badge ${tone}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[icon] || icons.info}</svg></span>`;
  }

  function injectBrushStyles() {
    const style = document.createElement("style");
    style.textContent = `
      :root {
        --color-bg: #f7fbfb;
        --color-card: #ffffff;
        --color-text: #172126;
        --color-muted: #6b7280;
        --color-border: #dceeee;
        --color-main: #0ABAB5;
        --color-main-dark: #078f8b;
        --color-main-soft: #e6f8f7;
        --color-main-border: #9de4e1;
        --shadow-card: 0 2px 10px rgba(0, 0, 0, 0.045);
        --radius-card: 14px;
        --radius-panel: 16px;
      }
      #dashboardMode { display: none !important; }
      #dashboardTitle { font-size: 1.72rem; font-weight: 900; letter-spacing: 0; }
      .app-shell { gap: 14px; }
      .app-header { gap: 12px; }
      .control-panel { gap: 9px; border-color: var(--color-border); border-radius: var(--radius-panel); box-shadow: 0 1px 8px rgba(0, 0, 0, 0.035); }
      .card { border-radius: var(--radius-card); box-shadow: var(--shadow-card); border-color: var(--color-border); }
      .card-header { gap: 10px; }
      .card h2 { letter-spacing: 0; }
      .chip, .tag { min-height: 26px; padding: 3px 9px; font-size: 0.78rem; }
      .icon-badge { width: 38px; height: 38px; flex: 0 0 38px; }
      .tab-button, .stock-tab { min-height: 34px; }
      .tab-button[aria-selected="true"], .stock-tab[aria-selected="true"] { border-color: var(--color-main-border); background: var(--color-main-soft); color: var(--color-main-dark); }
      .scope-tab-button[aria-selected="true"] { border-color: var(--color-main); color: var(--color-main-dark); }
      .brush-stock-header { align-items: flex-start; justify-content: space-between; gap: 12px; }
      .brush-header-chips { justify-content: flex-end; }
      .reflection-grid { display: grid; gap: 10px; }
      .reflection-block { display: grid; gap: 7px; padding: 11px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: #fbfdfd; }
      .reflection-block p { margin: 0; color: var(--color-text); }
      .reflection-title { display: flex; align-items: center; gap: 8px; }
      .reflection-title .icon-badge { width: 30px; height: 30px; flex-basis: 30px; }
      .reflection-title h3 { margin: 0; font-size: 0.9rem; color: var(--color-main-dark); }
      .reflection-block.red .reflection-title h3 { color: var(--color-red); }
      .brush-material-grid { display: grid; gap: 12px; }
      .brush-material-column { display: grid; gap: 8px; }
      .brush-material-column h3 { margin: 0; font-size: 0.88rem; color: var(--color-main-dark); }
      .brush-material-column.weak h3 { color: var(--color-orange); }
      .brush-summary-list { display: grid; gap: 9px; }
      .brush-summary-row { display: grid; gap: 5px; padding: 10px 0; border-top: 1px solid var(--color-border); }
      .brush-summary-row:first-child { border-top: 0; padding-top: 0; }
      .brush-summary-row span { color: var(--color-muted); font-size: 0.84rem; line-height: 1.45; }
      .brush-summary-row .name { color: var(--color-text); font-weight: 800; font-size: 0.94rem; }
      @media (min-width: 680px) {
        .brush-summary-row { grid-template-columns: minmax(120px, 1.1fr) repeat(4, minmax(0, 1fr)); align-items: center; }
      }
      @media (max-width: 520px) {
        .app-shell { padding: 14px; }
        .brush-stock-header { display: grid; grid-template-columns: 38px 1fr; }
        .brush-header-chips { grid-column: 1 / -1; justify-content: flex-start; }
      }
    `;
    document.head.appendChild(style);
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
