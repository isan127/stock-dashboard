(() => {
  const SUMMARY_TITLE = "\u9298\u67c4\u30b5\u30de\u30ea\u30fc";

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  function start() {
    cleanup();
    document.addEventListener("click", () => {
      window.setTimeout(cleanup, 160);
      window.setTimeout(cleanup, 700);
    }, true);

    let ticks = 0;
    const timer = window.setInterval(() => {
      cleanup();
      ticks += 1;
      if (ticks >= 80) window.clearInterval(timer);
    }, 300);
  }

  function cleanup() {
    if (selectedScope() !== "overall" || selectedPeriod() !== "weekly") return;
    const card = findCardByTitle(SUMMARY_TITLE);
    if (!card) return;
    const grids = Array.from(card.querySelectorAll(".terminal-mini-grid"));
    grids.slice(1).forEach((grid) => grid.remove());
  }

  function findCardByTitle(title) {
    return Array.from(document.querySelectorAll(".card")).find((card) => normalize(card.querySelector("h2")?.textContent) === title);
  }

  function selectedScope() {
    return document.querySelector(".scope-tabs [aria-selected='true']")?.dataset?.scope || "";
  }

  function selectedPeriod() {
    return document.querySelector(".period-tabs [aria-selected='true']")?.dataset?.period || "";
  }

  function normalize(value) {
    return String(value ?? "").replace(/\u3000/g, " ").trim();
  }
})();
