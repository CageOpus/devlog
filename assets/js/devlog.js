// CAGE devlog 的頁面互動。五件事，彼此獨立：
//   1. Bright / Dim 開關
//   2. 頁首跟著捲動變化：收合成捲動條，或（PWA 直拿）自動藏起
//   3. 文章頁的閱讀進度
//   4. 手機底部導覽列在 Safari 工具列收放時讓位
//   5. 橫屏 rail 的返回鍵

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

(function initHeaderScroll() {
  const header = document.querySelector("[data-site-header]");
  if (!header) return;

  // 版型決定頁首怎麼跟著捲動變化，由 CSS 的 --header-behavior 告訴這裡（見 css/devlog/02-chrome.css）
  let behavior = "none";

  // compact：捲過這個距離就收合。slot 固定佔住展開高度，收合不改變版面，不需要遲滯區間
  const COMPACT_AFTER = 8;

  // autohide：同一方向累積捲動超過這個距離才切換，避免手指微動就閃
  const AUTOHIDE_DELTA = 8;
  let anchorY = window.scrollY;

  function updateCompact(y) {
    header.classList.toggle("is-compact", y > COMPACT_AFTER);
  }

  function updateAutohide(y) {
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    if (y <= header.offsetHeight) {
      // 靠近頂端（含往下拉的回彈）一律顯示
      header.classList.remove("is-hidden");
      anchorY = y;
    } else if (y > maxY) {
      // 底部回彈：捲動值會先變大再縮回，不當成往上捲
    } else if (y > anchorY + AUTOHIDE_DELTA) {
      header.classList.add("is-hidden");
      anchorY = y;
    } else if (y < anchorY - AUTOHIDE_DELTA) {
      header.classList.remove("is-hidden");
      anchorY = y;
    }
  }

  function update() {
    const y = window.scrollY;
    if (behavior === "compact") updateCompact(y);
    if (behavior === "autohide") updateAutohide(y);
  }

  function measure() {
    behavior = getComputedStyle(header).getPropertyValue("--header-behavior").trim();
    // 換版型時清掉另一種行為留下的狀態
    if (behavior !== "compact") header.classList.remove("is-compact");
    if (behavior !== "autohide") header.classList.remove("is-hidden");
    update();
  }

  measure();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", measure);
})();

(function initReadProgress() {
  // 頁首與橫屏 rail 各有一個讀數
  const outputs = document.querySelectorAll("[data-read-progress]");
  const article = document.querySelector(".article__body");
  if (!outputs.length || !article) return;

  function update() {
    const rect = article.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    const ratio = scrollable > 0 ? -rect.top / scrollable : 1;
    const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
    outputs.forEach((el) => (el.textContent = percent + "%"));
  }

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
})();

(function initBottomNavYield() {
  const nav = document.querySelector("[data-bottom-nav]");
  const viewport = window.visualViewport;
  if (!nav || !viewport) return;

  // Safari 收放工具列時只發 visualViewport resize，而且過程中 safe-area inset 追不準：
  // 乾脆整條收到畫面外，等視窗與捲動都靜止這麼久再放回來
  const SETTLE_MS = 260;
  let timer = 0;

  function settleLater() {
    clearTimeout(timer);
    timer = setTimeout(() => nav.classList.remove("is-yielding"), SETTLE_MS);
  }

  viewport.addEventListener("resize", () => {
    nav.classList.add("is-yielding");
    settleLater();
  });

  // 讓位期間每次捲動都把計時往後推
  window.addEventListener(
    "scroll",
    () => {
      if (nav.classList.contains("is-yielding")) settleLater();
    },
    { passive: true },
  );
})();

(function initBackKey() {
  // 返回鍵的 href 是上一層頁面；從站內連過來時改用瀏覽器的上一頁，回到原本的捲動位置
  const cameFromSite = document.referrer.startsWith(location.origin) && history.length > 1;
  if (!cameFromSite) return;

  document.querySelectorAll("[data-back]").forEach((el) =>
    el.addEventListener("click", (event) => {
      event.preventDefault();
      history.back();
    }),
  );
})();
