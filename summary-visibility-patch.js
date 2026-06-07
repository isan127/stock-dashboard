(() => {
  const SUMMARY_TITLE = "\u9298\u67c4\u30b5\u30de\u30ea\u30fc";

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  function start() {
    enhanceSummaries();
    document.addEventListener("click", () => {
      scheduleEnhance(0);
      scheduleEnhance(160);
      scheduleEnhance(420);
      scheduleEnhance(900);
    }, true);

    let ticks = 0;
    const timer = window.setInterval(() => {
      enhanceSummaries();
      ticks += 1;
      if (ticks >= 120) window.clearInterval(timer);
    }, 250);

    let pending = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(pending);
      pending = window.setTimeout(enhanceSummaries, 40);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scheduleEnhance(delay) {
    window.setTimeout(enhanceSummaries, delay);
  }

  function enhanceSummaries() {
    const scope = selectedScope();
    const period = selectedPeriod();
    if (scope !== "overall") return;

    document.querySelectorAll(".card").forEach((card) => {
      const title = normalize(card.querySelector("h2")?.textContent);
      if (title !== SUMMARY_TITLE) return;
      const sourceList = card.querySelector(".brush-summary-list");
      if (!sourceList || sourceList.dataset.summaryVisibilityPeriod === period) return;

      const rows = Array.from(sourceList.querySelectorAll(".brush-summary-row"))
        .map((row) => Array.from(row.querySelectorAll("span")).map((span) => normalize(span.textContent)))
        .filter((row) => row.length && row.some(hasValue));

      if (!rows.length) return;

      card.classList.add("summary-card", `summary-card--${period}`);
      sourceList.className = `summary-list summary-list--${period}`;
      sourceList.dataset.summaryVisibilityPeriod = period;
      sourceList.innerHTML = rows.map((row) => renderRow(period, row)).join("");
    });
  }

  function renderRow(period, row) {
    if (period === "weekly") return renderWeeklyRow(row);
    if (period === "monthly") return renderMonthlyRow(row);
    return renderDailyRow(row);
  }

  function renderDailyRow(row) {
    const [name, conclusion, price, changeRate] = row;
    const changeTone = getChangeTone(changeRate);
    return `
      <article class="summary-row summary-row--daily">
        <div class="summary-main">
          <div class="summary-heading-line">
            <strong class="summary-name">${escapeHtml(valueOrDash(name))}</strong>
            ${renderBadge(conclusion, conclusionTone(conclusion))}
          </div>
          <div class="summary-meta">
            <span class="summary-price">${escapeHtml(valueOrDash(price))}</span>
          </div>
        </div>
        <div class="summary-side">
          <span class="summary-change is-${changeTone}">${escapeHtml(valueOrDash(changeRate))}</span>
        </div>
      </article>
    `;
  }

  function renderWeeklyRow(row) {
    const [name, actualMove, range, matchLevel, policy] = row;
    return `
      <article class="summary-row summary-row--weekly">
        <div class="summary-main">
          <strong class="summary-name">${escapeHtml(valueOrDash(name))}</strong>
          <div class="summary-meta">
            ${renderBadge(`${label("match")}\uff1a${valueOrDash(matchLevel)}`, matchTone(matchLevel))}
            ${renderBadge(shortDecision(policy), conclusionTone(policy))}
          </div>
          <p class="summary-note">${escapeHtml(valueOrDash(actualMove))}</p>
          ${hasValue(range) ? `<p class="summary-subnote">${escapeHtml(range)}</p>` : ""}
        </div>
      </article>
    `;
  }

  function renderMonthlyRow(row) {
    const [name, monthlyChange, monthlyTrend, nextPolicy] = row;
    const changeTone = getChangeTone(monthlyChange);
    return `
      <article class="summary-row summary-row--monthly">
        <div class="summary-main">
          <div class="summary-heading-line">
            <strong class="summary-name">${escapeHtml(valueOrDash(name))}</strong>
            ${renderBadge(shortDecision(nextPolicy), conclusionTone(nextPolicy))}
          </div>
          <div class="summary-meta">
            ${hasValue(monthlyTrend) ? `<span class="summary-subnote">${label("monthlyTrend")}\uff1a${escapeHtml(monthlyTrend)}</span>` : ""}
          </div>
        </div>
        <div class="summary-side">
          <span class="summary-change is-${changeTone}">${escapeHtml(valueOrDash(monthlyChange))}</span>
        </div>
      </article>
    `;
  }

  function renderBadge(text, tone) {
    if (!hasValue(text)) return "";
    return `<span class="summary-badge is-${tone}">${escapeHtml(text)}</span>`;
  }

  function shortDecision(valueText) {
    const text = valueOrDash(valueText);
    return text.split(/[:：。]/)[0].trim() || text;
  }

  function getChangeTone(valueText) {
    const text = String(valueText || "");
    if (text.includes("+") || text.includes("\uff0b")) return "up";
    if (text.includes("-") || text.includes("\u2212") || text.includes("\uff0d")) return "down";
    return "flat";
  }

  function conclusionTone(valueText) {
    const text = String(valueText || "");
    if (text.includes("\u8981\u6ce8\u610f") || text.includes("\u65b9\u91dd\u898b\u76f4")) return "danger";
    if (text.includes("\u6ce8\u610f") || text.includes("\u518d\u8a55\u4fa1") || text.includes("\u5229\u78ba")) return "warning";
    if (text.includes("\u653e\u7f6e") || text.includes("\u7d99\u7d9a")) return "main";
    return "neutral";
  }

  function matchTone(valueText) {
    const text = String(valueText || "");
    if (text.includes("\u9ad8")) return "main";
    if (text.includes("\u4e2d")) return "warning";
    if (text.includes("\u4f4e")) return "danger";
    return "neutral";
  }

  function selectedScope() {
    return document.querySelector(".scope-tabs [aria-selected='true']")?.dataset?.scope || "";
  }

  function selectedPeriod() {
    return document.querySelector(".period-tabs [aria-selected='true']")?.dataset?.period || "daily";
  }

  function label(key) {
    const labels = {
      match: "\u4e00\u81f4\u5ea6",
      monthlyTrend: "\u6708\u9593\u50be\u5411"
    };
    return labels[key] || key;
  }

  function valueOrDash(value) {
    return hasValue(value) ? normalize(value) : "---";
  }

  function hasValue(value) {
    const text = normalize(value);
    return Boolean(text && text !== "---" && text !== "--" && text !== "\u672a\u5165\u529b");
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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
