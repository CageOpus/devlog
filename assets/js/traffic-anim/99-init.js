/* 把頁面上的每個 [data-anim] 接上它的場景與播放器。
   播放器：進入視窗一半才開始播、離開就暫停；播完停在最後一格。
   手動換拍（進度格、上一步、下一步）只播那一拍：從開頭播到結尾就停住；按 ▶ 才恢復連續播放。
   zoomable 的圖卡由 js/devlog.js「圖卡放大」整張搬進面板再搬回，播放器跟著走，狀態不斷。
   不理會 prefers-reduced-motion：這些圖的內容就是動作本身，停格看不懂（作者決定，2026-10-02）。 */
(() => {
  const TA = window.TrafficAnim;

  const mount = (fig) => {
    const make = TA.scenes[fig.dataset.anim];
    const stage = fig.querySelector(".anim__stage");
    if (!make || !stage) return;

    const svg = TA.el("svg", { class: "anim__svg", "aria-hidden": "true" });
    stage.appendChild(svg);
    const scene = make(svg);
    const tl = scene.tl;
    svg.setAttribute("viewBox", `0 0 ${scene.w} ${scene.h}`);

    const narr = fig.querySelector(".anim__narration");
    const btnPlay = fig.querySelector("[data-anim-play]");
    const btnPrev = fig.querySelector("[data-anim-prev]");
    const btnNext = fig.querySelector("[data-anim-next]");
    const bar = fig.querySelector(".anim__beats");
    const lang = TA.lang();

    // 進度條：一拍一格，格寬比例於拍長；點格跳到該拍開頭
    const cells = tl.beats.map((b, i) => {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "anim__beat";
      c.style.flexGrow = String(b.d);
      c.setAttribute("aria-label", `${i + 1} / ${tl.beats.length}`);
      const fill = document.createElement("span");
      fill.className = "anim__beat-fill";
      c.appendChild(fill);
      c.addEventListener("click", () => jumpTo(i));
      bar.appendChild(c);
      return fill;
    });

    let t = 0, playing = false, last = 0, raf = 0, shownBeat = -1, started = false;
    // 手動換拍時播到這裡就停（該拍的結尾）；null = 連續播放
    let stopAt = null;
    const beatEnd = (i) => tl.starts[i] + tl.beats[i].d - 1e-3;

    // 中文旁白裡的車號（場景的 cars）加底線，跟「L3」「TRANSITION」這類字分開；英文不加。長的先比（S2 先於 S）
    const cars = (scene.cars || []).slice().sort((a, b) => b.length - a.length);
    const carRe = cars.length ? new RegExp(`(?<![A-Za-z0-9])(${cars.join("|")})(?![A-Za-z0-9])`) : null;
    const addText = (into, s, l) => {
      if (l !== "zh" || !carRe) { into.append(s); return; }
      // split 帶捕捉群組：奇數位是車號
      s.split(carRe).forEach((part, i) => {
        if (!(i % 2)) { into.append(part); return; }
        const u = document.createElement("span");
        u.className = "anim__car";
        u.textContent = part;
        into.append(u);
      });
    };
    // 拍子的 tip = { en: [錨點, 解釋], zh: [...] }：錨點包成 <abbr data-tip>，由 js/devlog.js「名詞解釋」浮出解釋
    const showNarration = (beat) => {
      const l = beat[lang] ? lang : "en";
      const txt = beat[l];
      const tip = beat.tip && beat.tip[l];
      const at = tip ? txt.indexOf(tip[0]) : -1;
      narr.replaceChildren();
      if (at < 0) { addText(narr, txt, l); return; }
      addText(narr, txt.slice(0, at), l);
      const abbr = document.createElement("abbr");
      abbr.dataset.tip = tip[1];
      abbr.tabIndex = 0;
      abbr.textContent = tip[0];
      narr.append(abbr);
      addText(narr, txt.slice(at + tip[0].length), l);
    };

    const render = () => {
      scene.update(t);
      const k = tl.beatAt(t);
      if (k !== shownBeat) {
        shownBeat = k;
        showNarration(tl.beats[k]);
      }
      cells.forEach((f, i) => {
        const p = TA.clamp01((t - tl.starts[i]) / tl.beats[i].d);
        f.style.transform = `scaleX(${p})`;
      });
      // 三個圖示都在鍵裡（shortcodes/anim.html），data-state 決定露哪個
      btnPlay.dataset.state = playing ? "pause" : t >= tl.total - 1e-3 ? "replay" : "play";
      btnPlay.setAttribute("aria-label", playing ? fig.dataset.lPause : fig.dataset.lPlay);
    };
    const seek = (nt) => { t = Math.max(0, Math.min(tl.total, nt)); render(); };
    const frame = (now) => {
      if (!playing) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      if (stopAt !== null && t >= stopAt) { t = stopAt; playing = false; stopAt = null; }
      if (t >= tl.total) { t = tl.total; playing = false; }
      render();
      if (playing) raf = requestAnimationFrame(frame);
    };
    const play = () => {
      if (playing) return;
      if (t >= tl.total - 1e-3) t = 0;
      playing = true; started = true;
      last = performance.now();
      render();
      raf = requestAnimationFrame(frame);
    };
    const pause = () => { playing = false; cancelAnimationFrame(raf); render(); };

    // 手動換拍：跳到該拍開頭，播完這一拍就停
    function jumpTo(i) {
      pause();
      seek(tl.starts[i]);
      stopAt = beatEnd(i);
      play();
    }

    btnPlay.addEventListener("click", () => {
      if (playing) { pause(); return; }
      stopAt = null;
      play();
    });
    btnPrev.addEventListener("click", () => jumpTo(Math.max(0, tl.beatAt(t) - 1)));
    btnNext.addEventListener("click", () => jumpTo(Math.min(tl.beats.length - 1, tl.beatAt(t) + 1)));

    // 放大（zoomable）由 js/devlog.js 的「圖卡放大」整張搬走；這裡只交出寬高比，面板用它把圖塞進畫面高度
    fig.querySelector(".anim__card").style.setProperty("--anim-aspect", String(scene.w / scene.h));

    // 只在看得到時播放
    new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !started) play();
        else if (!e.isIntersecting && playing) { pause(); started = false; }
      }
    }, { threshold: 0.5 }).observe(stage);

    render();
    // 除錯用：主控台 document.querySelector("[data-anim]").anim.seek(12)，
    // 或網址加 ?anim-t=12 讓頁上每個動畫停在第 12 秒、不自動播
    fig.anim = { seek: (s) => { pause(); seek(s); }, play, pause, total: tl.total, starts: tl.starts, time: () => t, stopAt: () => stopAt };
    const pinned = new URLSearchParams(location.search).get("anim-t");
    if (pinned !== null) { started = true; seek(parseFloat(pinned) || 0); }
  };

  // 除錯用：?anim-theme=dark|light 只在這次載入切 Bright / Dim（不寫進 pref-theme），截圖檢查兩套墨色用
  const forcedTheme = new URLSearchParams(location.search).get("anim-theme");
  if (forcedTheme === "dark" || forcedTheme === "light") document.documentElement.dataset.theme = forcedTheme;

  const boot = () => document.querySelectorAll("figure[data-anim]").forEach(mount);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
