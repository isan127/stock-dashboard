(() => {
  const style = document.createElement("style");
  style.textContent = `
    .compact-summary {
      display: grid;
    }

    .compact-summary-row {
      display: grid;
      gap: 8px;
      padding: 12px 0;
      border-top: 1px solid var(--color-border);
    }

    .compact-summary-row:first-child {
      padding-top: 0;
      border-top: 0;
    }

    .compact-summary-main,
    .compact-summary-details {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      min-width: 0;
    }

    .compact-summary-main {
      align-items: center;
    }

    .compact-summary-main strong {
      overflow-wrap: anywhere;
    }

    .inline-detail {
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      max-width: 100%;
      padding: 5px 9px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: #fbfcfb;
      color: var(--color-text);
      font-size: 0.82rem;
      font-weight: 800;
      overflow-wrap: anywhere;
    }

    .inline-detail span {
      color: var(--color-muted);
      font-size: 0.72rem;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
})();

function renderOverallWeekly(stocks) {
  const reviews = getWeeklyReviews();
  const summary = getWeeklySummary(stocks, reviews);
  const cautionStocks = getWeeklyCautionStocks(stocks, reviews);
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
    patchHeroCard("target", summary.actionTone, "対応の必要性", summary.actionRequired, summary.reason),
    renderInfoCard("scale", "現在の結論", makeOverallPolicy(stocks), renderChipRow(cautionStocks.map((stock) => stock.name), "red", "要注意銘柄なし")),
    cautionStocks.length ? renderInfoCard("alert", "要注意銘柄", "", renderChipRow(cautionStocks.map((stock) => stock.name), "red")) : "",
    reasons.length ? renderListCard("lightbulb", "主な理由", reasons, "green") : renderInfoCard("lightbulb", "主な理由", summary.reason),
    renderStockWeeklySummaryCard(stocks, reviews),
    watchPoints.length ? renderListCard("eye", "見るポイント", watchPoints, "green") : "",
    triggers.length ? renderListCard("alert", "方針変更トリガー", triggers, "orange") : ""
  ].filter(Boolean).join("");
}

function renderOverallMonthly(stocks) {
  const summary = getSummary(stocks);
  const cautionStocks = stocks.filter((stock) => isCautionStock(stock));
  const watchPoints = uniqueList(stocks.flatMap((stock) => normalizeList(stock.watchPoints))).slice(0, 5);
  const triggers = uniqueList(stocks.flatMap((stock) => normalizeList(stock.policyTriggers || stock.triggers))).slice(0, 5);

  return [
    patchHeroCard("flag", "neutral", "対応の必要性", "月次データはまだありません", "月次ログが整うまでは、月間変化や翌月方針を無理に日次データから作りません。"),
    renderInfoCard("scale", "現在の結論", summary.overallPolicy, renderChipRow(cautionStocks.map((stock) => stock.name), "red", "要注意銘柄なし")),
    cautionStocks.length ? renderInfoCard("alert", "要注意銘柄", "", renderChipRow(cautionStocks.map((stock) => stock.name), "red")) : "",
    renderInfoCard("lightbulb", "主な理由", "月次データが未整備のため、今月の総括はまだ表示していません。"),
    renderEmpty("月次データはまだありません"),
    watchPoints.length ? renderListCard("eye", "見るポイント", watchPoints, "green") : "",
    triggers.length ? renderListCard("alert", "方針変更トリガー", triggers, "orange") : ""
  ].filter(Boolean).join("");
}

function renderStockWeeklySummaryCard(stocks, reviews) {
  if (!reviews.length) return renderEmpty("週次レビューはまだありません");
  return `
    <section class="card">
      <div class="card-header">
        ${iconBadge("target")}
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

function renderInlineDetail(label, value) {
  if (!hasValue(value)) return "";
  return `<span class="inline-detail"><span>${escapeHtml(label)}</span>${escapeHtml(String(value))}</span>`;
}

function getWeeklyReviews() {
  const reviews = Array.isArray(dashboardData?.weeklyReviews)
    ? dashboardData.weeklyReviews
    : Array.isArray(dashboardData?.weeklyReview)
      ? dashboardData.weeklyReview
      : dashboardData?.weeklyReview
        ? [dashboardData.weeklyReview]
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

function getWeeklyCautionStocks(stocks, reviews) {
  const cautionByReview = reviews
    .filter((review) => {
      const matchLevel = String(field(review, ["matchLevel", "一致度"], ""));
      const nextPolicy = String(field(review, ["provisionalNextPolicy", "nextWeekPolicy", "来週に向けた暫定方針"], ""));
      return matchLevel.includes("低") || nextPolicy.includes("要注意") || nextPolicy.includes("方針見直し");
    })
    .map((review) => findStockForReview(stocks, review))
    .filter(Boolean);

  return uniqueStocks([...stocks.filter((stock) => isCautionStock(stock)), ...cautionByReview]);
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

function patchHeroCard(icon, tone, title, result, body) {
  try {
    return renderHeroCard({ icon, tone, title, result, body });
  } catch {
    return renderHeroCard(icon, tone, title, result, body);
  }
}
