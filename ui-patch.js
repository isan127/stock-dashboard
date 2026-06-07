(() => {
  let patchData = null;
  let applying = false;

  injectPatchStyles();
  document.addEventListener("DOMContentLoaded", initPatch);

  async function initPatch() {
    patchData = await loadPatchData();
    document.addEventListener("click", () => window.setTimeout(applyOverallPeriodPatch, 0));
    window.setTimeout(applyOverallPeriodPatch, 1200);
  }

  async function loadPatchData() {
    const config = window.STOCK_DASHBOARD_CONFIG || {};
    const remoteUrl = typeof config.REMOTE_DATA_URL === "string" ? config.REMOTE_DATA_URL.trim() : "";
    const candidates = config.USE_REMOTE_DATA === true && remoteUrl ? [remoteUrl, "data.json"] : ["data.json"];

    for (const candidate of candidates) {
      try {
        const response = await fetch(withTimestamp(candidate), { cache: "no-store" });
        if (response.ok) return await response.json();
      } catch (error) {
        console.error("ui patch data load failed", candidate, error);
      }
    }
    return null;
  }

  function applyOverallPeriodPatch() {
    if (!patchData || applying) return;

    const selectedScope = document.querySelector(".scope-tabs [aria-selected='true']")?.dataset?.scope;
    const selectedPeriod = document.querySelector(".period-tabs [aria-selected='true']")?.dataset?.period;
    const content = document.getElementById("content");
    if (!content || selectedScope !== "overall" || !["weekly", "monthly"].includes(selectedPeriod)) return;

    applying = true;
    content.innerHTML = selectedPeriod === "weekly"
      ? renderPatchOverallWeekly(getPatchStocks())
      : renderPatchOverallMonthly(getPatchStocks());
    content.dataset.uiPatchPeriod = selectedPeriod;
    applying = false;
  }

  function renderPatchOverallWeekly(stocks) {
    const reviews = getPatchWeeklyReviews();
    const summary = getPatchWeeklySummary(reviews);
    const cautionStocks = getPatchWeeklyCautionStocks(stocks, reviews);
    const reasons = uniqueList(reviews.flatMap((review) => [
      field(review, ["actualMove", "weeklyResult", "実際の値動き"]),
      field(review, ["missedPoints", "外れた点"]),
      field(review, ["matchedPoints", "hitPoints", "当たった点"])
    ])).slice(0, 4);
    const watchPoints = uniqueList([
      ...reviews.map((review) => field(review, ["nextImprovement", "nextImprovePoints", "次回に活かす点"])),
      ...stocks.flatMap((stock) => normalizeList(stock.watchPoints))
    ]).slice(0, 5);
    const triggers = uniqueList(stocks.flatMap((stock) => normalizeList(stock.policyTriggers || stock.triggers))).slice(0, 5);

    return [
      renderHeroCard("対応の必要性", summary.actionRequired, summary.reason, summary.actionTone),
      renderInfoCard("現在の結論", makeOverallPolicy(stocks), renderChipRow(cautionStocks.map((stock) => stock.name), "red", "要注意銘柄なし")),
      cautionStocks.length ? renderInfoCard("要注意銘柄", "", renderChipRow(cautionStocks.map((stock) => stock.name), "red")) : "",
      reasons.length ? renderListCard("主な理由", reasons, "green") : renderInfoCard("主な理由", summary.reason),
      renderWeeklySummaryCard(stocks, reviews),
      watchPoints.length ? renderListCard("見るポイント", watchPoints, "green") : "",
      triggers.length ? renderListCard("方針変更トリガー", triggers, "orange") : ""
    ].filter(Boolean).join("");
  }

  function renderPatchOverallMonthly(stocks) {
    const summary = getPatchSummary(stocks);
    const cautionStocks = stocks.filter(isCautionStock);
    const watchPoints = uniqueList(stocks.flatMap((stock) => normalizeList(stock.watchPoints))).slice(0, 5);
    const triggers = uniqueList(stocks.flatMap((stock) => normalizeList(stock.policyTriggers || stock.triggers))).slice(0, 5);

    return [
      renderHeroCard("対応の必要性", "月次データはまだありません", "月次ログが整うまでは、月間変化や翌月方針を無理に日次データから作りません。", "neutral"),
      renderInfoCard("現在の結論", summary.overallPolicy, renderChipRow(cautionStocks.map((stock) => stock.name), "red", "要注意銘柄なし")),
      cautionStocks.length ? renderInfoCard("要注意銘柄", "", renderChipRow(cautionStocks.map((stock) => stock.name), "red")) : "",
      renderInfoCard("主な理由", "月次データが未整備のため、今月の総括はまだ表示していません。"),
      renderEmpty("月次データはまだありません"),
      watchPoints.length ? renderListCard("見るポイント", watchPoints, "green") : "",
      triggers.length ? renderListCard("方針変更トリガー", triggers, "orange") : ""
    ].filter(Boolean).join("");
  }

  function renderWeeklySummaryCard(stocks, reviews) {
    if (!reviews.length) return renderEmpty("週次レビューはまだありません");
    return `
      <section class="card">
        <div class="card-header">
          ${iconBadge("green")}
          <h2>銘柄サマリー</h2>
        </div>
        <div class="compact-summary">
          ${reviews.map((review) => {
            const stock = findStockForReview(stocks, review);
            const stockName = field(review, ["name", "stockName", "銘柄名"], stock?.name || "銘柄");
            const nextPolicy = field(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], conclusion(stock || {}));
            return `
              <article class="compact-summary-row">
                <div class="compact-summary-main">
                  <strong>${escapeHtml(stockName)}</strong>
                  ${renderChip(nextPolicy, toneForConclusion(nextPolicy))}
                </div>
                <div class="compact-summary-details">
                  ${renderInlineDetail("週間変化", field(review, ["actualMove", "weeklyResult", "実際の値動き"], ""))}
                  ${renderInlineDetail("週内レンジ", field(review, ["actualRange"], "") || formatRangeParts(field(review, ["actualRangeLow", "実際レンジ下限"], ""), field(review, ["actualRangeHigh", "実際レンジ上限"], "")) || formatRangeParts(field(review, ["forecastRangeLow", "想定レンジ下限"], ""), field(review, ["forecastRangeHigh", "想定レンジ上限"], "")))}
                  ${renderInlineDetail("一致度", field(review, ["matchLevel", "一致度"], ""))}
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderHeroCard(title, result, body, tone = "green") {
    return `
      <section class="card hero-card">
        <div class="card-header">
          ${iconBadge(tone)}
          <div>
            <h2>${escapeHtml(title)}</h2>
            <p class="hero-result">${escapeHtml(textValue(result, "未設定"))}</p>
          </div>
        </div>
        ${hasValue(body) ? `<p class="lead">${escapeHtml(body)}</p>` : ""}
      </section>
    `;
  }

  function renderInfoCard(title, body, extra = "") {
    if (!hasValue(body) && !hasValue(extra)) return "";
    return `
      <section class="card">
        <div class="card-header">
          ${iconBadge("green")}
          <h2>${escapeHtml(title)}</h2>
        </div>
        ${hasValue(body) ? `<p class="compact-text">${escapeHtml(body)}</p>` : ""}
        ${extra || ""}
      </section>
    `;
  }

  function renderListCard(title, items, tone = "green") {
    const normalized = normalizeList(items);
    if (!normalized.length) return "";
    return `
      <section class="card">
        <div class="card-header">
          ${iconBadge(tone)}
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

  function renderChip(text, tone = "neutral") {
    return `<span class="chip ${tone}">${escapeHtml(textValue(text, "未設定"))}</span>`;
  }

  function renderInlineDetail(label, value) {
    if (!hasValue(value)) return "";
    return `<span class="inline-detail"><span>${escapeHtml(label)}</span>${escapeHtml(String(value))}</span>`;
  }

  function renderEmpty(message) {
    return `<section class="card"><p class="empty-note">${escapeHtml(message)}</p></section>`;
  }

  function iconBadge(tone = "green") {
    return `<span class="icon-badge ${tone}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg></span>`;
  }

  function getPatchStocks() {
    return Array.isArray(patchData?.stocks) ? patchData.stocks.filter(Boolean) : [];
  }

  function getPatchWeeklyReviews() {
    const reviews = Array.isArray(patchData?.weeklyReviews)
      ? patchData.weeklyReviews
      : Array.isArray(patchData?.weeklyReview)
        ? patchData.weeklyReview
        : patchData?.weeklyReview
          ? [patchData.weeklyReview]
          : [];
    return reviews.filter((review) => review && hasWeeklyReviewContent(review));
  }

  function hasWeeklyReviewContent(review) {
    return [
      field(review, ["code", "証券コード"], ""),
      field(review, ["name", "stockName", "銘柄名"], ""),
      field(review, ["actualMove", "weeklyResult", "実際の値動き"], ""),
      field(review, ["actualRange", "実際レンジ"], ""),
      field(review, ["actualRangeLow", "実際レンジ下限"], ""),
      field(review, ["actualRangeHigh", "実際レンジ上限"], ""),
      field(review, ["matchLevel", "一致度"], ""),
      field(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], "")
    ].some(hasValue);
  }

  function findStockForReview(stocks, review) {
    const reviewCode = String(field(review, ["code", "証券コード"], ""));
    const reviewName = String(field(review, ["name", "stockName", "銘柄名"], ""));
    return stocks.find((stock) =>
      (stock.code && reviewCode === String(stock.code)) ||
      (stock.name && reviewName === String(stock.name))
    );
  }

  function getPatchWeeklyCautionStocks(stocks, reviews) {
    const cautionByReview = reviews
      .filter((review) => {
        const matchLevel = String(field(review, ["matchLevel", "一致度"], ""));
        const nextPolicy = String(field(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], ""));
        return matchLevel.includes("低") || nextPolicy.includes("要注意") || nextPolicy.includes("方針見直し");
      })
      .map((review) => findStockForReview(stocks, review))
      .filter(Boolean);

    return uniqueStocks([...stocks.filter(isCautionStock), ...cautionByReview]);
  }

  function uniqueStocks(stocks) {
    const seen = new Set();
    return stocks.filter((stock) => {
      const key = stock.code || stock.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getPatchSummary(stocks) {
    const summary = patchData?.summary || {};
    const cautionStocks = stocks.filter(isCautionStock);
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

  function getPatchWeeklySummary(reviews) {
    const lowMatch = reviews.some((review) => String(field(review, ["matchLevel", "一致度"], "")).includes("低"));
    return {
      actionRequired: lowMatch ? "来週は要注意" : reviews.length ? "様子見継続" : "週次レビューはまだありません",
      actionTone: lowMatch ? "orange" : "green",
      reason: reviews.length ? "週次レビューの一致度と来週方針を確認します。" : "週次レビュー表示データが入ると、ここに要約が表示されます。"
    };
  }

  function makeOverallPolicy(stocks) {
    const conclusions = stocks.map(conclusion).filter(hasValue);
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

  function normalizeList(value) {
    const source = Array.isArray(value) ? value : hasValue(value) ? String(value).split(/[\n｜|]/) : [];
    return source.map(cleanReferenceText).filter(hasValue);
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

  function formatRangeParts(low, high, fallback = "") {
    const lowText = textValue(low, "");
    const highText = textValue(high, "");
    if (lowText && highText) return `${lowText} 〜 ${highText}`;
    return lowText || highText || fallback;
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

  function cleanReferenceText(value) {
    return String(value ?? "").replace(/\s{2,}/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function withTimestamp(url) {
    return `${url}${url.includes("?") ? "&" : "?"}uiPatchT=${Date.now()}`;
  }

  function injectPatchStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .compact-summary { display: grid; }
      .compact-summary-row { display: grid; gap: 8px; padding: 12px 0; border-top: 1px solid var(--color-border); }
      .compact-summary-row:first-child { padding-top: 0; border-top: 0; }
      .compact-summary-main, .compact-summary-details { display: flex; flex-wrap: wrap; gap: 7px; min-width: 0; }
      .compact-summary-main { align-items: center; }
      .compact-summary-main strong { overflow-wrap: anywhere; }
      .inline-detail { display: inline-flex; align-items: baseline; gap: 5px; max-width: 100%; padding: 5px 9px; border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: #fbfcfb; color: var(--color-text); font-size: 0.82rem; font-weight: 800; overflow-wrap: anywhere; }
      .inline-detail span { color: var(--color-muted); font-size: 0.72rem; white-space: nowrap; }
    `;
    document.head.appendChild(style);
  }
})();
