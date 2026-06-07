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

  const CARD_ICONS = {
    "対応の必要性": ["shield", "green"],
    "現在の結論": ["scale", "green"],
    "要注意銘柄": ["alert", "red"],
    "主な理由": ["info", "green"],
    "銘柄サマリー": ["table", "green"],
    "見るポイント": ["eye", "green"],
    "方針変更トリガー": ["alert", "orange"],
    "株価サマリー": ["lineChart", "green"],
    "関連ニュース": ["document", "green"],
    "最短見通し": ["flag", "orange"],
    "週次サマリー": ["calendar", "green"],
    "実際の値動き": ["lineChart", "green"],
    "一致度": ["target", "red"],
    "予想の振り返り": ["review", "green"],
    "来週に向けた暫定方針": ["flag", "orange"],
    "月間サマリー": ["calendarMonth", "green"],
    "月間の主な理由": ["document", "green"],
    "強弱材料": ["balance", "green"],
    "来月方針": ["flag", "orange"],
    "来月見るポイント": ["eye", "green"],
    "月次評価": ["calendarMonth", "green"]
  };

  const INLINE_ICONS = {
    "当たった点": ["checkCircle", "green"],
    "外れた点": ["xCircle", "red"],
    "次回に活かす点": ["lightbulb", "green"],
    "強材料": ["trendUp", "green"],
    "弱材料 / 注意材料": ["trendDown", "orange"],
    "弱材料": ["trendDown", "orange"],
    "注意材料": ["alert", "orange"]
  };

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
      if (ticks >= 30) window.clearInterval(timer);
    }, 1000);

    let pending = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(pending);
      pending = window.setTimeout(applyIconFix, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function applyIconFix() {
    document.querySelectorAll(".card").forEach((card) => {
      const heading = card.querySelector("h2")?.textContent?.trim();
      if (!heading || !CARD_ICONS[heading]) return;
      const [icon, tone] = CARD_ICONS[heading];
      replaceHeaderIcon(card.querySelector(".card-header"), icon, tone);
    });

    document.querySelectorAll(".reflection-title, .brush-material-column").forEach((container) => {
      const heading = container.querySelector("h3")?.textContent?.trim();
      if (!heading || !INLINE_ICONS[heading]) return;
      const [icon, tone] = INLINE_ICONS[heading];
      replaceHeaderIcon(container, icon, tone, "small");
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
})();
