(() => {
  const BEFORE = "今週の予想・答え合わせ";
  const AFTER = "今週の予想・結果";

  function rewriteWeeklyLabels(root = document) {
    root.querySelectorAll("#content h2, #content h3, #content span, #content strong, #content p").forEach((node) => {
      if (node.childElementCount > 0) return;
      if (node.textContent.includes(BEFORE)) {
        node.textContent = node.textContent.replaceAll(BEFORE, AFTER);
      }
    });
  }

  function install() {
    const content = document.getElementById("content");
    if (!content) return;
    rewriteWeeklyLabels(content);
    new MutationObserver(() => rewriteWeeklyLabels(content)).observe(content, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
