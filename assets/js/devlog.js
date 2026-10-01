// CAGE devlog 的頁面互動。六件事，彼此獨立：
//   1. Bright / Dim 開關
//   2. 頁首跟著捲動變化：收合成捲動條，或（PWA 直拿）自動藏起
//   3. 文章頁的閱讀進度
//   4. 手機底部導覽列在 Safari 工具列收放時讓位
//   5. 橫屏 rail 的返回鍵
//   6. 瀏覽器語言跟這一頁不同、但有對應的譯本時，把語言切換鍵按三下提示
//   7. 「加入主畫面」鍵與說明面板
//   8. RSS 鍵與面板

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

(function initLangHint() {
  // 語言切換鍵只有在這一頁有譯本時才帶 data-lang-hint，hreflang 是譯本的語言（見 partials/lang-switch.html）
  const keys = document.querySelectorAll("[data-lang-hint]");
  if (keys.length === 0) return;

  // 訪客自己按的語言記下來，之後從站外進首頁就去這個語言（轉址在 partials/head.html）
  keys.forEach((key) =>
    key.addEventListener("click", () => {
      try {
        localStorage.setItem("pref-lang", key.getAttribute("hreflang"));
      } catch (e) {}
    }),
  );

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // 訪客自己按過語言鍵就以那次的選擇為準，沒按過才看瀏覽器的第一順位語言
  let storedLang = null;
  try {
    storedLang = localStorage.getItem("pref-lang");
  } catch (e) {}
  const userLang = storedLang || navigator.languages?.[0] || navigator.language || "";
  const pageLang = document.documentElement.lang;
  const translationLang = keys[0].getAttribute("hreflang");
  if (!userLang || speaks(userLang, pageLang) || !speaks(userLang, translationLang)) return;

  // 提示的次數上限，存的是每次提示的時間：一個月（滾動 30 天）最多三次，兩小時內最多兩次
  const HINT_KEY = "lang-hint-shown";
  const HINT_LIMITS = [
    { windowMs: 30 * 24 * 60 * 60 * 1000, times: 3 },
    { windowMs: 2 * 60 * 60 * 1000, times: 2 },
  ];
  const HINT_KEEP_MS = Math.max(...HINT_LIMITS.map((limit) => limit.windowMs));
  let shown = [];
  try {
    shown = JSON.parse(localStorage.getItem(HINT_KEY)) || [];
  } catch (e) {}
  const now = Date.now();
  shown = shown.filter((t) => typeof t === "number" && now - t < HINT_KEEP_MS);
  const capped = HINT_LIMITS.some(
    ({ windowMs, times }) => shown.filter((t) => now - t < windowMs).length >= times,
  );
  if (capped) return;
  shown.push(now);
  try {
    localStorage.setItem(HINT_KEY, JSON.stringify(shown));
  } catch (e) {}

  // 用設計系統按鍵的 [data-pressing]（跟手指真的按下去是同一套樣式與回彈）：按住、放開、停一下，重複三次
  const PRESS_MS = 110;
  const REST_MS = 240;
  const TIMES = 3;
  const START_DELAY_MS = 400;

  function press(round) {
    keys.forEach((key) => key.setAttribute("data-pressing", ""));
    setTimeout(() => {
      keys.forEach((key) => key.removeAttribute("data-pressing"));
      if (round < TIMES) setTimeout(() => press(round + 1), REST_MS);
    }, PRESS_MS);
  }

  const start = () => setTimeout(() => press(1), START_DELAY_MS);
  if (document.readyState === "complete") start();
  else addEventListener("load", start, { once: true });

  // 瀏覽器的語言標籤（en-GB、zh-Hant-TW……）算不算站上的某個語言（en、zh-tw，或 <html lang> 的 en-US、zh-TW）。
  // 只看主語言：en-XX 都算英文；zh-XX 不分繁簡都算中文（站上只有繁體，簡體讀者看繁體總比看英文順），
  // 跟首頁轉址的規則一樣（見 partials/head.html）
  function speaks(browserTag, siteTag) {
    return browserTag.toLowerCase().split("-")[0] === siteTag.toLowerCase().split("-")[0];
  }
})();

(function initInstall() {
  const button = document.querySelector("[data-install]");
  const dialog = document.querySelector("[data-install-dialog]");
  if (!button || !dialog) return;

  // 已經是從主畫面開啟的就不必再提示
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) return;

  const platform = detectPlatform();
  if (!platform) return;
  dialog.querySelector(`[data-install-platform="${platform}"]`).hidden = false;
  button.hidden = false;

  // Chromium 符合安裝條件時會先發 beforeinstallprompt：留著，按鍵時直接叫出系統的安裝視窗
  let installPrompt = null;
  addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
  });
  addEventListener("appinstalled", () => {
    button.hidden = true;
  });

  button.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      return;
    }
    dialog.showModal();
    dialog.focus();
  });

  // 點面板外面（backdrop）也關掉
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  // 對應 partials/install-dialog.html 的四組步驟；Firefox 桌面版不支援安裝網頁，回傳 null 不顯示按鍵
  function detectPlatform() {
    const ua = navigator.userAgent;
    // iPadOS 的 Safari 預設回報成 Mac，用觸控點數分辨
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (isIOS) return "ios";
    if (/Android/.test(ua)) return "android";
    if (/Firefox\//.test(ua)) return null;
    const isMacSafari = /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
    if (isMacSafari) return "mac-safari";
    return "desktop";
  }
})();

(function initRss() {
  const button = document.querySelector("[data-rss]");
  const dialog = document.querySelector("[data-rss-dialog]");
  if (!button || !dialog) return;

  // 鍵本身是連到 XML 的連結（沒有 JS 時的退路）；有 JS 就改開面板
  button.addEventListener("click", (event) => {
    event.preventDefault();
    dialog.showModal();
    dialog.focus();
  });

  // 點面板外面（backdrop）也關掉
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  // 網址欄點一下就全選，方便手動複製
  const url = dialog.querySelector("[data-rss-url]");
  url.addEventListener("focus", () => url.select());

  // 複製：鍵上換成「已複製」並停用一下再恢復（兩個字都在鍵裡，CSS 切換顯示，鍵寬不變）。
  // Clipboard API 不能用時（非 https 等）退回選取 + execCommand
  const copy = dialog.querySelector("[data-rss-copy]");
  const [copyLabel, copiedLabel] = copy.querySelectorAll(".rss-dialog__copy-label");
  // 停用用 aria-disabled 而不是 disabled：原生 disabled 會把焦點從鍵上踢掉，鍵盤使用者會迷路
  function setCopied(on) {
    copy.classList.toggle("is-copied", on);
    copy.setAttribute("aria-disabled", String(on));
    copyLabel.setAttribute("aria-hidden", String(on));
    copiedLabel.setAttribute("aria-hidden", String(!on));
  }
  copy.addEventListener("click", async () => {
    if (copy.getAttribute("aria-disabled") === "true") return;
    try {
      await navigator.clipboard.writeText(url.value);
    } catch (e) {
      url.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  });
})();
