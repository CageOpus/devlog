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

(function initCheats() {
  // 連按 BUILD 讀數二十下（每下間隔不到一秒）跳出密技面板；目前只有 /debug（見 partials/cheat-dialog.html）
  const dialog = document.querySelector("[data-cheat-dialog]");
  if (!dialog) return;
  const form = dialog.querySelector("[data-cheat-form]");
  const input = dialog.querySelector("[data-cheat-input]");
  const result = dialog.querySelector("[data-cheat-result]");
  const TAPS = 20;
  const GAP_MS = 1000;
  const DEBUG_KEY = "cage-debug";
  // 回應的字串由樣板依語言放在 data-* 上（i18n/）
  const STR = {
    unknown: dialog.dataset.cheatUnknown,
    on: dialog.dataset.cheatDebugOn,
    off: dialog.dataset.cheatDebugOff,
  };

  let taps = 0;
  let lastTap = 0;
  document.querySelectorAll("[data-build]").forEach((el) =>
    el.addEventListener("click", () => {
      const now = Date.now();
      taps = now - lastTap < GAP_MS ? taps + 1 : 1;
      lastTap = now;
      if (taps < TAPS) return;
      taps = 0;
      input.value = "";
      result.textContent = "";
      dialog.showModal();
      input.focus();
    }),
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = input.value.trim().toLowerCase();
    if (code === "/debug") {
      const on = !readout;
      setDebug(on);
      result.textContent = on ? STR.on : STR.off;
    } else {
      result.textContent = STR.unknown;
    }
    input.select();
  });

  // ── 除錯讀數：右上角，每半秒更新。開關記在 localStorage，重新整理後還在 ──
  let readout = null;
  let timer = 0;
  let frameId = 0;

  function setDebug(on) {
    try {
      if (on) localStorage.setItem(DEBUG_KEY, "1");
      else localStorage.removeItem(DEBUG_KEY);
    } catch (e) {}
    if (on && !readout) startReadout();
    if (!on && readout) {
      clearInterval(timer);
      cancelAnimationFrame(frameId);
      readout.remove();
      readout = null;
    }
  }

  function startReadout() {
    readout = document.createElement("pre");
    readout.className = "debug-readout";
    readout.setAttribute("aria-hidden", "true");
    document.body.append(readout);

    // 頁面本身的更新率：requestAnimationFrame 一秒跑幾次（iOS 省電模式會壓到 30 左右）
    let pageFrames = 0;
    const countFrame = () => {
      pageFrames++;
      frameId = requestAnimationFrame(countFrame);
    };
    frameId = requestAnimationFrame(countFrame);

    let battery = null;
    navigator.getBattery?.().then((b) => (battery = b), () => {});

    let lastTime = performance.now();
    let lastHamFrames = window.cageHamster?.frames ?? 0;
    const render = () => {
      const now = performance.now();
      const sec = (now - lastTime) / 1000;
      const ham = window.cageHamster;
      const hamFrames = ham?.frames ?? 0;
      const lines = [
        `FPS  ${Math.round(pageFrames / sec)}`,
        ham ? `HAM  ${Math.round((hamFrames - lastHamFrames) / sec)} · ${ham.state()}${ham.retro() ? " · RETRO" : ""}` : "HAM  —",
        `BAT  ${battery ? `${Math.round(battery.level * 100)}%${battery.charging ? " · CHARGING" : ""}` : "n/a"}`,
      ];
      readout.textContent = lines.join("\n");
      pageFrames = 0;
      lastTime = now;
      lastHamFrames = hamFrames;
    };
    // 第一次要等半秒才有數字可算
    readout.textContent = "FPS  …";
    timer = setInterval(render, 500);
  }

  let stored = null;
  try {
    stored = localStorage.getItem(DEBUG_KEY);
  } catch (e) {}
  if (stored) startReadout();
})();


/* ── 放大進面板（共用）：籠子（js/hamster.js）與圖卡（下面的「圖卡放大」）都用這一套 ──
   把一塊東西整個搬進 modal（top layer，不受欄寬限制），原位換成一塊同高的空框（slot），關掉時放回去。
   搬動的是同一批節點，裡面的事件、狀態、迴圈都不用重接。
   進出原位都有網點：
     搬走時原位先放一份複本（.is-leaving）用網點消失，播完才換成空框；
     關閉動畫一開始（面板掛上 .is-closing，見下面的 initDialogClose），原位就放一份複本（.is-returning）用網點長出來，
     跟面板收回去同時進行；close 事件發的時候再拿本尊無縫換掉複本。
   複本只是畫面：不能點、讀屏器不念，跟空框一樣高，換來換去版面一點都不動，捲動位置也不會被瀏覽器調整。
   兩個 class 的動畫由各自的 CSS 決定（.hamster 在 08-hamster.css，.cage-figure 在 02-chrome.css）。
   用法：const zoom = DevlogZoom(dialog); zoom.open(target, { button, slot, scrub })
     button 放大鍵，在面板裡換成縮回（target 掛 .is-zoomed、aria-label 換成 data-label-out），關掉後焦點回到它；
     slot   原位的空框，高度由這裡設；scrub(copy) 讓呼叫端從複本拿掉不該重複的東西（例如 data-* 掛鉤）。
   一個面板一次只放一塊；Esc、點面板外面都會放回去。 */
window.DevlogZoom = (() => {
  const controllers = new WeakMap();
  const motion = matchMedia("(prefers-reduced-motion: no-preference)");
  return (dialog) => {
    if (controllers.has(dialog)) return controllers.get(dialog);
    let cur = null;
    const setZoomed = (on) => {
      cur.target.classList.toggle("is-zoomed", on);
      cur.button?.setAttribute("aria-label", cur.button.dataset[on ? "labelOut" : "labelIn"]);
    };
    const copy = (cls) => {
      const c = cur.target.cloneNode(true);
      cur.scrub?.(c);
      c.setAttribute("aria-hidden", "true");
      c.inert = true;
      c.classList.remove("is-zoomed", "is-leaving", "is-returning");
      c.classList.add(cls);
      c.style.height = cur.slot.style.height;
      return c;
    };
    const open = (target, { button, slot, scrub } = {}) => {
      if (dialog.open) return;
      cur = { target, button, slot, scrub, ghost: null, back: null };
      target.classList.remove("is-returning");
      slot.style.height = `${target.getBoundingClientRect().height}px`;
      if (motion.matches) {
        const ghost = (cur.ghost = copy("is-leaving"));
        ghost.addEventListener("animationend", (event) => {
          if (event.target !== ghost || !event.animationName.startsWith("dialog-dither-out")) return;
          if (ghost.isConnected) ghost.replaceWith(slot);
        });
        target.before(ghost);
      } else {
        target.before(slot);
      }
      dialog.append(target);
      setZoomed(true);
      dialog.showModal();
      button?.focus();
    };
    new MutationObserver(() => {
      if (!cur || !dialog.classList.contains("is-closing") || cur.back) return;
      cur.back = copy("is-returning");
      (cur.ghost?.isConnected ? cur.ghost : cur.slot).replaceWith(cur.back);
    }).observe(dialog, { attributes: true, attributeFilter: ["class"] });
    dialog.addEventListener("close", () => {
      if (!cur) return;
      const { target, button, slot, ghost, back } = cur;
      // 複本已經長出來了就直接換掉；沒有複本（不播動畫時）才在這裡放回去並顯現
      const holder = back?.isConnected ? back : ghost?.isConnected ? ghost : slot;
      holder.replaceWith(target);
      if (holder !== back) target.classList.add("is-returning");
      setZoomed(false);
      button?.focus({ preventScroll: true });
      cur = null;
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    // 顯現播完就拿掉 .is-returning（不播動畫時留著也無妨，下次放大會先清掉）
    dialog.ownerDocument.addEventListener("animationend", (event) => {
      if (event.animationName.startsWith("dialog-dither-in") && event.target.classList?.contains("is-returning") && !event.target.inert) event.target.classList.remove("is-returning");
    });
    const api = { open };
    controllers.set(dialog, api);
    return api;
  };
})();

/* ── 圖卡放大（partials/figure-zoom.html、partials/figure-dialog.html） ──
   圖卡抬頭的放大鍵把整張 .cage-figure 搬進面板（上面的 DevlogZoom），原位換成同高的空框。
   同一顆鍵在面板裡換成縮回圖示（.is-zoomed），就是關閉鍵；Esc、點外面也會放回 */
(function initFigureZoom() {
  const dialog = document.querySelector("[data-figure-dialog]");
  if (!dialog) return;
  const zoom = window.DevlogZoom(dialog);
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-figure-zoom]");
    if (!btn) return;
    if (dialog.open) return dialog.close();
    const card = btn.closest(".cage-figure");
    if (!card) return;
    // 面板的無障礙名稱跟著圖卡的標題
    dialog.setAttribute("aria-label", card.querySelector(".cage-figure__title")?.textContent || "FIG");
    const slot = document.createElement("div");
    slot.className = "figure-zoom-hole";
    zoom.open(card, { button: btn, slot });
  });
})();

/* ── 面板關掉時先播完動畫（css/devlog/02-chrome.css「開面板的動畫」） ──
   瀏覽器一關掉 dialog 就把它移出 top layer，Safari 還不支援延後移出（overlay），收回去的動畫來不及播。
   所以關閉都先經過這裡：掛上 .is-closing 播動畫，等面板與裡面的收回動畫都播完才真的關；只等 dialog-* 這組，籠子裡倉鼠自己的動畫不等，最多等 MAX_MS。會關掉面板的路徑都接過來：
   程式呼叫 close()、Esc（cancel 事件）、面板裡 method="dialog" 的表單（× 鍵）。close 事件因此在動畫播完才發 */
(function initDialogClose() {
  const MAX_MS = 1000;
  const motion = matchMedia("(prefers-reduced-motion: no-preference)");
  const close = HTMLDialogElement.prototype.close;
  for (const d of document.querySelectorAll("dialog")) {
    d.close = function (value) {
      if (!this.open || this.classList.contains("is-closing")) return;
      if (!motion.matches) return close.call(this, value);
      this.classList.add("is-closing");
      const exits = this.getAnimations({ subtree: true }).filter((a) => a.animationName?.startsWith("dialog-"));
      const done = () => {
        if (!this.classList.contains("is-closing")) return;
        this.classList.remove("is-closing");
        close.call(this, value);
      };
      Promise.all(exits.map((a) => a.finished)).then(done, done);
      setTimeout(done, MAX_MS);
    };
    d.addEventListener("cancel", (event) => {
      event.preventDefault();
      d.close();
    });
    d.querySelectorAll('form[method="dialog"]').forEach((form) =>
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        d.close(event.submitter?.value);
      }),
    );
  }
})();

/* ── Firefox：網點動畫先偷播一次（css/devlog/02-chrome.css 的 dialog-dither-in / -out） ──
   Firefox 第一次用到遮罩圖時才解碼、點陣化，第一次開面板的網點會缺格。載入完、閒下來時拿一個
   幾乎透明、不吃點擊的小方塊把兩段網點動畫原樣播一遍（遮罩格子同樣 8px），之後開面板就直接用快取 */
(function warmDither() {
  if (!/firefox/i.test(navigator.userAgent)) return;
  if (!matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
  const run = () => {
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:fixed;left:0;top:0;width:16px;height:16px;opacity:.01;pointer-events:none;background:#000;" +
      "mask-size:8px 8px;animation:dialog-dither-in .3s linear both,dialog-dither-out .2s linear .3s forwards";
    el.addEventListener("animationend", (event) => event.animationName === "dialog-dither-out" && el.remove());
    document.body.append(el);
  };
  const idle = () => ("requestIdleCallback" in window ? requestIdleCallback(run, { timeout: 2000 }) : setTimeout(run, 200));
  document.readyState === "complete" ? idle() : addEventListener("load", idle, { once: true });
})();
/* ── 毛玻璃從頁面上拿起來（css/devlog/02-chrome.css「開面板的動畫」） ──
   玻璃淡入的同時，隔著玻璃看到的頁面慢慢放大到 LIFT 倍，面板開著時就維持略大；關掉時從當下的大小縮回原狀，
   跟玻璃淡出同一條曲線、同樣長（關掉從面板掛上 .is-closing 那一刻算起）。backdrop-filter 只能原地取背後的像素，不會放大，所以放大的是頁面本身。
   縮放的是頁面的每一塊（.site-header 與 body 底下除了 slot 以外的子元素），不是整個 body：
   頁首、底部導覽是 fixed，外層一有 transform 它們就改以外層定位而跳位。每一塊的 transform-origin
   都換算成同一個點（畫面正中央），縮起來才像整頁一起縮；面板開著時背景還是捲得動，捲動時重算。
   密技面板沒有毛玻璃，不放大 */
(function initGlassLift() {
  const motion = matchMedia("(prefers-reduced-motion: no-preference)");
  const html = document.documentElement;
  const LIFT = 1.04;
  const OPEN = { duration: 450, easing: "cubic-bezier(.25, .8, .25, 1)" };
  const CLOSE = { duration: 300, easing: "cubic-bezier(.4, 0, .2, 1)" };
  const dialogs = [...document.querySelectorAll(".install-dialog, .rss-dialog, .hamster-dialog, .figure-dialog")];
  let parts = [];
  let anims = [];
  let wasOpen = false;

  const aim = () => {
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    for (const el of parts) {
      // 要的是縮放前的位置：以 origin 為中心縮放 k 倍後，左上角會移到 left + ox × (1 − k)，反推回去
      const r = el.getBoundingClientRect();
      const k = parseFloat(getComputedStyle(el).scale) || 1;
      const [ox, oy] = (el.style.transformOrigin || "0px 0px").split(" ").map(parseFloat);
      const left = r.left - ox * (1 - k);
      const top = r.top - oy * (1 - k);
      el.style.transformOrigin = `${cx - left}px ${cy - top}px`;
    }
  };

  const lift = () => {
    if (!html.classList.contains("is-lifted")) {
      html.style.setProperty("--lift-extent", `${html.scrollHeight}px`);
      parts = [...document.querySelectorAll(".site-header, body > :not(.site-header-slot, dialog, script, svg, .debug-readout)")];
      parts.forEach((el) => (el.style.transformOrigin = ""));
      aim();
      html.classList.add("is-lifted");
      addEventListener("scroll", aim, { passive: true });
    }
    const from = parts.map((el) => getComputedStyle(el).scale);
    anims.forEach((a) => a.cancel());
    anims = parts.map((el, i) =>
      el.animate([{ scale: from[i] === "none" ? 1 : from[i] }, { scale: LIFT }], { ...OPEN, fill: "forwards" }),
    );
  };

  const settle = () => {
    const from = parts.map((el) => getComputedStyle(el).scale);
    anims.forEach((a) => a.cancel());
    anims = parts.map((el, i) => el.animate([{ scale: from[i] === "none" ? 1 : from[i] }, { scale: 1 }], CLOSE));
    const mine = anims;
    Promise.all(mine.map((a) => a.finished)).then(() => {
      if (mine !== anims) return;
      removeEventListener("scroll", aim);
      html.classList.remove("is-lifted");
      parts.forEach((el) => (el.style.transformOrigin = ""));
      anims = [];
    }, () => {});
  };

  const sync = () => {
    const open = dialogs.some((d) => d.open && !d.classList.contains("is-closing"));
    if (open === wasOpen) return;
    wasOpen = open;
    if (!motion.matches) return;
    open ? lift() : settle();
  };
  const watch = new MutationObserver(sync);
  dialogs.forEach((d) => watch.observe(d, { attributes: true, attributeFilter: ["open", "class"] }));
})();
