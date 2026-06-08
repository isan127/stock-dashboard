(() => {
  const STYLE_ID = "terminal-runtime-readability-fixes";

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  function start() {
    injectFixes();
    document.addEventListener("click", () => window.setTimeout(injectFixes, 80), true);
    let ticks = 0;
    const timer = window.setInterval(() => {
      injectFixes();
      ticks += 1;
      if (ticks >= 80) window.clearInterval(timer);
    }, 300);
  }

  function injectFixes() {
    const previous = document.getElementById(STYLE_ID);
    if (previous) previous.remove();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .summary-row--daily {
        grid-template-columns: minmax(0, 1fr) max-content !important;
      }
      .summary-heading-line,
      .summary-name {
        min-width: 0 !important;
      }
      .summary-name {
        overflow-wrap: anywhere !important;
      }
      .terminal-daily-values {
        min-width: min(100%, 288px) !important;
      }
      .terminal-daily-values span {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-height: 27px !important;
        min-width: 72px !important;
        white-space: nowrap !important;
      }
      .news-card,
      .card .news-card {
        border: 1px solid rgba(94, 235, 255, 0.22) !important;
        border-radius: 8px !important;
        background: linear-gradient(180deg, rgba(0, 212, 255, 0.08), rgba(7, 17, 26, 0.22)), rgba(7, 17, 26, 0.72) !important;
        color: var(--color-text) !important;
        box-shadow: inset 0 0 18px rgba(0, 212, 255, 0.045) !important;
      }
      .news-card a,
      .news-card strong {
        color: var(--color-main-dark) !important;
      }
      .news-card p {
        color: #CFE7F0 !important;
      }
      .news-card .footer-note {
        color: var(--color-muted) !important;
      }
      @media (max-width: 560px) {
        .summary-row--daily {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
})();
