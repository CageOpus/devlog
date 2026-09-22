// CAGE devlog 的頁面互動。三件事，彼此獨立：
//   1. Bright / Dim 開關
//   2. 頁首捲出畫面後顯示捲動條
//   3. 文章頁的閱讀進度

(function initThemeSwitch() {
  const root = document.documentElement;
  const switches = document.querySelectorAll("[data-theme-switch]");

  // 開關的位置與燈號由 CSS 依 <html data-theme> 決定，這裡只同步無障礙狀態
  function syncAria() {
    const isBright = root.dataset.theme !== "dark";
    switches.forEach((el) => el.setAttribute("aria-checked", String(isBright)));
  }

  function toggle() {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("pref-theme", next);
    } catch (e) {
      // 私密模式等情況下存不了，只影響下次載入
    }
    syncAria();
  }

  switches.forEach((el) => el.addEventListener("click", toggle));
  syncAria();
})();

(function initScrolledBar() {
  const header = document.querySelector("[data-site-header]");
  const bar = document.querySelector("[data-site-bar]");
  if (!header || !bar || !("IntersectionObserver" in window)) return;

  new IntersectionObserver(([entry]) => {
    const visible = !entry.isIntersecting;
    bar.classList.toggle("is-visible", visible);
    bar.setAttribute("aria-hidden", String(!visible));
  }).observe(header);
})();

(function initReadProgress() {
  const output = document.querySelector("[data-read-progress]");
  const article = document.querySelector(".article__body");
  if (!output || !article) return;

  function update() {
    const rect = article.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    const ratio = scrollable > 0 ? -rect.top / scrollable : 1;
    const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
    output.textContent = percent + "%";
  }

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
})();
