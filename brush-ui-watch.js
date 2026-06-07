(() => {
  document.addEventListener("DOMContentLoaded", () => {
    let ticks = 0;
    const timer = window.setInterval(() => {
      refreshBrushUi();
      ticks += 1;
      if (ticks >= 30) window.clearInterval(timer);
    }, 1000);

    let pending = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(pending);
      pending = window.setTimeout(refreshBrushUi, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    refreshBrushUi();
  });

  function refreshBrushUi() {
    setBrand();
    normalizeTabs();
    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  function setBrand() {
    document.title = "StockScope";
    const title = document.getElementById("dashboardTitle");
    const mode = document.getElementById("dashboardMode");
    if (title) title.textContent = "StockScope";
    if (mode) {
      mode.textContent = "";
      mode.style.display = "none";
    }
  }

  function normalizeTabs() {
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
})();
