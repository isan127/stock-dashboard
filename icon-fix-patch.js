(() => {
  const FALLBACK_ICONS = {
    check: '<path d="M20 6L9 17l-5-5"></path>',
    shield: '<path d="M12 3l7 3v5c0 5-3.4 8.1-7 10-3.6-1.9-7-5-7-10V6l7-3z"></path><path d="M9 12l2 2 4-5"></path>',
    scale: '<path d="M12 3v18"></path><path d="M5 7h14"></path><path d="M6 7l-4 7h8L6 7z"></path><path d="M18 7l-4 7h8l-4-7z"></path>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 11h18"></path>',
    calendarMonth: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path>',
    lineChart: '<path d="M3 19h18"></path><path d="M4 15l4-4 4 3 6-8"></path><path d="M18 6h-4"></path><path d="M18 6v4"></path>',
    target: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>',
    review: '<path d="M9 6h11"></path><path d="M9 12h11"></path><path d="M9 18h11"></path><path d="M4 6l1 1 2-2"></path><path d="M4 12l1 1 2-2"></path><path d="M4 18l1 1 2-2"></path>',
    list: '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18"></path><path d="M9 4v16"></path><path d="M15 4v16"></path>',
    checkCircle: '<circle cx="12" cy="12" r="9"></circle><path d="M8 12l3 3 5-6"></path>',
    xCircle: '<circle cx="12" cy="12" r="9"></circle><path d="M15 9l-6 6"></path><path d="M9 9l6 6"></path>',
    lightbulb: '<path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8 14a6 6 0 1 1 8 0c-.8.7-1 1.4-1 2H9c0-.6-.2-1.3-1-2z"></path>',
    flag: '<path d="M5 22V4"></path><path d="M5 4h11l-1.5 4L16 12H5"></path>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7h.01"></path>',
    document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
    alert: '<path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>',
    trendUp: '<path d="M3 17l6-6 4 4 7-7"></path><path d="M14 8h6v6"></path>',
    trendDown: '<path d="M3 7l6 6 4-4 7 7"></path><path d="M14 16h6v-6"></path>',
    thumbsUp: '<path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path><path d="M7 11l4-8 1.5 1.5c.7.7.9 1.7.5 2.6L12 10h6a2 2 0 0 1 2 2l-1 7a2 2 0 0 1-2 2H7V11z"></path>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h9v18"></path><path d="M15 8h3a2 2 0 0 1 2 2v11"></path><path d="M8 7h3"></path><path d="M8 11h3"></path><path d="M8 15h3"></path>',
    factory: '<path d="M3 21V9l5 4V9l5 4V5h4v16"></path><path d="M13 13h8v8H3"></path><path d="M7 17h.01"></path><path d="M11 17h.01"></path><path d="M15 17h.01"></path>',
    balance: '<path d="M12 3v18"></path><path d="M5 7h14"></path><path d="M6 7l-4 7h8L6 7z"></path><path d="M18 7l-4 7h8l-4-7z"></path>',
    split: '<path d="M6 3v5a6 6 0 0 0 6 6h6"></path><path d="M18 9l4 5-4 5"></path><path d="M6 21v-5a6 6 0 0 1 6-6h2"></path>'
  };

  const CARD_ICONS = new Map([
    ["\u5bfe\u5fdc\u306e\u5fc5\u8981\u6027", ["shield", "green"]],
    ["\u73fe\u5728\u306e\u7d50\u8ad6", ["scale", "green"]],
    ["\u8981\u6ce8\u610f\u9298\u67c4", ["alert", "red"]],
    ["\u4e3b\u306a\u7406\u7531", ["info", "green"]],
    ["\u9298\u67c4\u30b5\u30de\u30ea\u30fc", ["table", "green"]],
    ["\u898b\u308b\u30dd\u30a4\u30f3\u30c8", ["eye", "green"]],
    ["\u65b9\u91dd\u5909\u66f4\u30c8\u30ea\u30ac\u30fc", ["alert", "orange"]],
    ["\u682a\u4fa1\u30b5\u30de\u30ea\u30fc", ["lineChart", "green"]],
    ["\u95a2\u9023\u30cb\u30e5\u30fc\u30b9", ["document", "green"]],
    ["\u6700\u77ed\u898b\u901a\u3057", ["flag", "orange"]],
    ["\u9031\u6b21\u30b5\u30de\u30ea\u30fc", ["calendar", "green"]],
    ["\u5b9f\u969b\u306e\u5024\u52d5\u304d", ["lineChart", "green"]],
    ["\u4e00\u81f4\u5ea6", ["target", "red"]],
    ["\u4e88\u60f3\u306e\u632f\u308a\u8fd4\u308a", ["review", "green"]],
    ["\u6765\u9031\u306b\u5411\u3051\u305f\u66ab\u5b9a\u65b9\u91dd", ["flag", "orange"]],
    ["\u6708\u9593\u30b5\u30de\u30ea\u30fc", ["calendarMonth", "green"]],
    ["\u6708\u9593\u306e\u4e3b\u306a\u7406\u7531", ["document", "green"]],
    ["\u5f37\u5f31\u6750\u6599", ["balance", "green"]],
    ["\u6765\u6708\u65b9\u91dd", ["flag", "orange"]],
    ["\u6765\u6708\u898b\u308b\u30dd\u30a4\u30f3\u30c8", ["eye", "green"]],
    ["\u6708\u6b21\u8a55\u4fa1", ["calendarMonth", "green"]]
  ]);

  const INLINE_ICONS = new Map([
    ["\u5f53\u305f\u3063\u305f\u70b9", ["checkCircle", "green"]],
    ["\u5916\u308c\u305f\u70b9", ["xCircle", "red"]],
    ["\u6b21\u56de\u306b\u6d3b\u304b\u3059\u70b9", ["lightbulb", "green"]],
    ["\u5f37\u6750\u6599", ["trendUp", "green"]],
    ["\u5f31\u6750\u6599 / \u6ce8\u610f\u6750\u6599", ["trendDown", "orange"]],
    ["\u5f31\u6750\u6599", ["trendDown", "orange"]],
    ["\u6ce8\u610f\u6750\u6599", ["alert", "orange"]]
  ]);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  function start() {
    applyIconFix();
    let ticks = 0;
    const timer = window.setInterval(() => {
      applyIconFix();
      ticks += 1;
      if (ticks >= 90) window.clearInterval(timer);
    }, 500);

    let pending = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(pending);
      pending = window.setTimeout(applyIconFix, 50);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function applyIconFix() {
    document.querySelectorAll(".card").forEach((card) => {
      const heading = normalize(card.querySelector("h2")?.textContent);
      const spec = CARD_ICONS.get(heading);
      if (!spec) return;
      replaceHeaderIcon(card.querySelector(".card-header"), spec[0], spec[1]);
    });

    document.querySelectorAll(".reflection-title, .brush-material-column, .individual-material-column").forEach((container) => {
      const heading = normalize(container.querySelector("h3")?.textContent);
      const spec = INLINE_ICONS.get(heading);
      if (!spec) return;
      replaceHeaderIcon(container, spec[0], spec[1], "small");
    });
  }

  function replaceHeaderIcon(container, icon, tone, size = "") {
    if (!container || container.dataset.iconName === icon) return;
    const badge = iconBadge(icon, tone, size);
    const current = container.querySelector(".icon-badge");
    if (current) {
      current.replaceWith(badge);
    } else {
      container.insertBefore(badge, container.firstChild);
    }
    container.dataset.iconName = icon;
  }

  function iconBadge(icon, tone, size) {
    const icons = window.STOCK_SCOPE_ICONS || FALLBACK_ICONS;
    const span = document.createElement("span");
    span.className = `icon-badge ${tone}${size ? ` ${size}` : ""}`;
    span.dataset.iconName = icon;
    span.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[icon] || icons.check || ""}</svg>`;
    return span;
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
})();
