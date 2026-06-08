(() => {
  const EMPTY_TEXT = "\u6708\u6b21\u30c7\u30fc\u30bf\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093";

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  function start() {
    apply();
    document.addEventListener("click", () => {
      window.setTimeout(apply, 120);
      window.setTimeout(apply, 600);
    }, true);

    let ticks = 0;
    const timer = window.setInterval(() => {
      apply();
      ticks += 1;
      if (ticks >= 80) window.clearInterval(timer);
    }, 300);
  }

  function apply() {
    if (selectedPeriod() !== "monthly") return;
    const content = document.getElementById("content");
    if (!content || content.dataset.monthlyEmptyFixed === "1") return;
    if (!content.textContent.includes(EMPTY_TEXT)) return;

    content.innerHTML = `
      <section class="card terminal-empty-card">
        <div class="card-header">
          ${iconBadge("calendarMonth")}
          <h2>${EMPTY_TEXT}</h2>
        </div>
        <p class="empty-note">\u6708\u6b21\u30ed\u30b0\u304c\u5165\u308b\u307e\u3067\u306f\u3001\u65e5\u6b21\u30fb\u9031\u6b21\u30c7\u30fc\u30bf\u3092\u7121\u7406\u306b\u6708\u6b21\u6271\u3044\u3057\u307e\u305b\u3093\u3002</p>
      </section>
    `;
    content.dataset.monthlyEmptyFixed = "1";
  }

  function selectedPeriod() {
    return document.querySelector(".period-tabs [aria-selected='true']")?.dataset?.period || "";
  }

  function iconBadge(name) {
    const icons = window.STOCK_SCOPE_ICONS || {};
    const svg = icons[name] || icons.calendarMonth || icons.info || "";
    return `<span class="icon-badge green"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${svg}</svg></span>`;
  }
})();
