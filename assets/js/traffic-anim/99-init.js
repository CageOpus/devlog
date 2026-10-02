/* 把頁面上的每個 [data-anim] 接上它的場景與播放器。
   播放器：進入視窗一半才開始播、離開就暫停；播完停在最後一格。
   手動換拍（進度格、上一步、下一步）只播那一拍：從開頭播到結尾就停住；按 ▶ 才恢復連續播放。
   zoomable 的圖卡由 js/devlog.js「圖卡放大」整張搬進面板再搬回，播放器跟著走，狀態不斷。
   不理會 prefers-reduced-motion：這些圖的內容就是動作本身，停格看不懂（作者決定，2026-10-02）。

   語音導覽（beta）：按某張的「語音導覽」鍵，那張從第一拍播到最後一拍，像看影片，播完自己退出（每張各自獨立，不接著播下一張）；
   旁白用瀏覽器內建朗讀（Web Speech API）念。每一拍的長度取「動畫」和「念完」兩者較長的：
   念得比動畫久，就把這一拍的動畫放慢，剛好跟著念完一起結束，畫面不會停在拍尾乾等。
   再按一次就退出。聲音由訪客的系統決定：只有白名單裡的聲音（Chrome 的 Google）算可靠，
   其他的先跳確認面板（partials/tour-dialog.html），按「仍要播放」才開始。 */
(() => {
  const TA = window.TrafficAnim;

  // ── 朗讀：挑聲音、把字整理成好念的樣子 ──
  const synth = window.speechSynthesis;
  const norm = (l) => (l || "").replace("_", "-").toLowerCase();
  const pickVoice = (lang) => {
    if (!synth) return null;
    const want = lang === "zh" ? "zh-tw" : "en";
    const rank = (v) =>
      (/Natural|Online/i.test(v.name) ? 4 : 0) + (/Google/i.test(v.name) ? 3 : 0) +
      (/Enhanced|Premium|Mei-?Jia|美佳|Samantha/i.test(v.name) ? 2 : 0) + (norm(v.lang) === "en-us" ? 1 : 0) -
      (/Grandma|Grandpa|Bad News|Bubbles|Bells|Boing|Bahh|Whisper|Zarvox|Trinoids|Jester|Organ|Cellos|Albert|Superstar|Wobble/i.test(v.name) ? 5 : 0);
    const all = synth.getVoices();
    const pool = all.filter((v) => norm(v.lang).startsWith(want));
    const fallback = lang === "zh" ? all.filter((v) => norm(v.lang).startsWith("zh")) : [];
    return (pool.length ? pool : fallback).sort((a, b) => rank(b) - rank(a))[0] || null;
  };
  // 念起來可靠的聲音：只認 Chrome 的 Google 線上聲音（作者實際聽過的）。其他都先跳確認
  const GOOD_VOICE = /^Google /;
  // 念出來比較順的寫法（畫面上的字不變）。中文裡括號附註的英文原文（「提案（proposals）」）不念
  const SAY = {
    zh: [[/（[A-Za-z][A-Za-z0-9 \-]*）/g, ""], [/0xFFFFFFFF/g, "零x 八個 F"], [/1\/15/g, "十五分之一"], [/[（）]/g, "，"]],
    en: [[/0xFFFFFFFF/g, "all F's"], [/1\/15/g, "one fifteenth"]],
  };
  const spoken = (text, lang) => SAY[lang].reduce((s, [re, to]) => s.replace(re, to), text);
  // Chrome 的線上聲音念太長的一句會被截斷：拆成一句一句排隊
  const sentences = (text) => text.split(/(?<=[。！？；：.!?;:])\s*/).map((s) => s.trim()).filter(Boolean);
  // 估念多久用的「份量」：一個漢字算 1，英文字母、數字各算 0.35（中英文的語速剛好都落在每秒 4.5 份上下）
  const units = (s) => (s.match(/[㐀-鿿]/g) || []).length + 0.35 * (s.match(/[A-Za-z0-9]/g) || []).length;
  // 每秒念幾份：先猜 4.5，每念完一句就照實際速度修正（兩種語言各記各的）
  const pace = { zh: 4.5, en: 4.5 };

  // ── 語音導覽：一次只有一張。按哪張的鍵就從那張的第一拍播到最後一拍，播完自己退出；不接著播別張 ──
  const tour = {
    lead: null, pending: null,
    // 按下語音導覽鍵：聲音在白名單裡就直接播；不在（或不能朗讀）先跳確認面板（partials/tour-dialog.html）
    request(p) {
      const dlg = document.querySelector("[data-tour-dialog]");
      const v = pickVoice(p.lang);
      if (!dlg || (synth && v && GOOD_VOICE.test(v.name))) { this.start(p); return; }
      dlg.querySelector("[data-tour-text]").textContent =
        synth && v ? dlg.dataset.lVoice.replace("{voice}", v.name) : dlg.dataset.lNovoice;
      this.pending = p;
      dlg.showModal();
    },
    start(p) {
      if (this.lead) this.stop();
      this.lead = p;
      p.sync(true);
      p.restart();
    },
    stop() {
      const p = this.lead;
      if (!p) return;
      this.lead = null;
      p.pause();
      p.sync(false);
      synth && synth.cancel();
    },
  };
  // 確認面板的「仍要播放」：在點擊裡直接開始（iOS 要在點擊裡第一次出聲；面板的關閉動畫另外跑）
  const bindDialog = () => {
    const go = document.querySelector("[data-tour-go]");
    if (go) go.addEventListener("click", () => {
      const p = tour.pending;
      tour.pending = null;
      if (p) tour.start(p);
    });
  };
  // Chrome 的聲音清單是非同步載入的：先要一次，按鍵時才拿得到
  if (synth) { synth.getVoices(); synth.addEventListener?.("voiceschanged", () => synth.getVoices()); }

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
    const btnTour = fig.querySelector("[data-anim-tour]");
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

    let t = 0, playing = false, last = null, raf = 0, shownBeat = -1, started = false;
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

    // ── 朗讀（只在語音導覽、而且這張帶頭時） ──
    // saidBeat = 正在念（或念完）的那一拍；talking = 還沒念完。gen 讓被取消的那批 onend 失效。
    // speech 記這一拍念到哪：總份量、念完的份量、開始念與上一句念完的時間，拿來估還要念多久
    let saidBeat = -1, talking = false, gen = 0, rate = 1;
    let speech = null;
    const leading = () => tour.lead === me;
    const say = (k) => {
      if (!synth) return;
      const my = ++gen;
      const beat = tl.beats[k];
      const l = beat[lang] ? lang : "en";
      const parts = sentences(spoken(beat[l], l));
      saidBeat = k;
      talking = parts.length > 0;
      speech = { l, total: parts.reduce((n, s) => n + units(s), 0), done: 0, began: performance.now(), lastEnd: null };
      const start = () => {
        if (my !== gen) return; // 等待中又換拍了
        const v = pickVoice(l);
        speech.began = performance.now();
        parts.forEach((s, i) => {
          const u = new SpeechSynthesisUtterance(s);
          u.lang = l === "zh" ? "zh-TW" : "en-US";
          if (v) u.voice = v;
          u.onend = u.onerror = () => {
            if (my !== gen) return;
            const now = performance.now();
            speech.done += units(s);
            speech.lastEnd = now;
            const secs = (now - speech.began) / 1000;
            if (secs > 0.5) pace[l] = 0.5 * pace[l] + 0.5 * (speech.done / secs);
            if (i === parts.length - 1) talking = false;
          };
          synth.speak(u);
        });
      };
      // Chrome：cancel() 之後馬上 speak()，有時 cancel 沒生效，舊的那一拍繼續念、新的排在後面。
      // 還在念就先取消、隔一下再開始；沒在念就直接開始（iOS 要在點擊裡第一次出聲）
      if (synth.speaking || synth.pending) {
        synth.cancel();
        setTimeout(() => { if (my === gen) { synth.cancel(); start(); } }, 120);
      } else {
        start();
      }
    };
    const hush = () => {
      if (saidBeat < 0 && !talking) return;
      gen++; talking = false; saidBeat = -1; speech = null;
      synth && synth.cancel();
    };
    // 還要念幾秒（估的）：剩下的份量 ÷ 語速，再扣掉這一句已經念了的時間
    const speechLeft = () => {
      if (!talking || !speech) return 0;
      const now = performance.now();
      const since = (now - (speech.lastEnd ?? speech.began)) / 1000;
      return Math.max(0.3, (speech.total - speech.done) / pace[speech.l] - since);
    };

    const render = () => {
      scene.update(t);
      const k = tl.beatAt(t);
      if (k !== shownBeat) {
        shownBeat = k;
        showNarration(tl.beats[k]);
      }
      if (playing && leading() && saidBeat !== k) say(k);
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
      // rAF 給的 now 是這一格開始的時間，可能比 play() 被點下的那一刻還早：第一格只記時間不前進，dt 也不准是負的
      // （負的會把時間倒回上一拍的拍尾，開著朗讀時就會重念上一拍、畫面卡在那裡）
      if (last === null) last = now;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      // 語音導覽：還要念的比這一拍剩下的動畫久，就把動畫放慢，讓兩者一起結束（最慢放到 0.15 倍）
      let want = 1;
      if (leading() && talking && saidBeat >= 0) {
        const animLeft = beatEnd(saidBeat) - t;
        const left = speechLeft();
        if (left > animLeft) want = Math.max(0.15, animLeft / left);
      }
      rate += (want - rate) * 0.12;
      t += dt * rate;
      // 估錯了、動畫先到拍尾：停在拍尾等念完
      if (leading() && talking && saidBeat >= 0 && t > beatEnd(saidBeat)) t = beatEnd(saidBeat);
      if (stopAt !== null && t >= stopAt) { t = stopAt; playing = false; stopAt = null; }
      if (t >= tl.total) {
        t = tl.total; playing = false;
        if (leading()) { render(); tour.stop(); return; }
      }
      render();
      if (playing) raf = requestAnimationFrame(frame);
    };
    const play = () => {
      if (playing) return;
      if (t >= tl.total - 1e-3) t = 0;
      playing = true; started = true;
      last = null; rate = 1;
      render();
      raf = requestAnimationFrame(frame);
    };
    const pause = () => { playing = false; cancelAnimationFrame(raf); hush(); render(); };

    // 手動換拍：跳到該拍開頭，播完這一拍就停（語音導覽中不停，接著往下播）
    function jumpTo(i) {
      pause();
      seek(tl.starts[i]);
      stopAt = leading() ? null : beatEnd(i);
      play();
    }

    const me = {
      fig, lang, pause,
      restart: () => { pause(); seek(0); stopAt = null; play(); },
      sync: (on) => {
        btnTour.setAttribute("aria-pressed", String(on));
        btnTour.classList.toggle("cage-face--sunk", on);
      },
    };

    btnPlay.addEventListener("click", () => {
      if (playing) { pause(); return; }
      stopAt = null;
      play();
    });
    btnPrev.addEventListener("click", () => jumpTo(Math.max(0, tl.beatAt(t) - 1)));
    btnNext.addEventListener("click", () => jumpTo(Math.min(tl.beats.length - 1, tl.beatAt(t) + 1)));
    if (btnTour) btnTour.addEventListener("click", () => (leading() ? tour.stop() : tour.request(me)));

    // 放大（zoomable）由 js/devlog.js 的「圖卡放大」整張搬走；這裡只交出寬高比，面板用它把圖塞進畫面高度
    fig.querySelector(".anim__card").style.setProperty("--anim-aspect", String(scene.w / scene.h));

    // 只在看得到時播放（正在語音導覽的那張不看捲動：像影片，捲走了也繼續播）
    new IntersectionObserver((entries) => {
      if (leading()) return;
      for (const e of entries) {
        if (e.isIntersecting && !started) play();
        else if (!e.isIntersecting && playing) { pause(); started = false; }
      }
    }, { threshold: 0.5 }).observe(stage);

    render();
    // 除錯用：主控台 document.querySelector("[data-anim]").anim.seek(12)，
    // 或網址加 ?anim-t=12 讓頁上每個動畫停在第 12 秒、不自動播
    fig.anim = {
      seek: (s) => { pause(); seek(s); }, play, pause, total: tl.total, starts: tl.starts, time: () => t, stopAt: () => stopAt,
      state: () => ({ t, playing, talking, saidBeat, stopAt, rate, leading: leading(), speechLeft: speechLeft(), pace: { ...pace } }),
    };
    const pinned = new URLSearchParams(location.search).get("anim-t");
    if (pinned !== null) { started = true; seek(parseFloat(pinned) || 0); }
  };

  // 除錯用：?anim-theme=dark|light 只在這次載入切 Bright / Dim（不寫進 pref-theme），截圖檢查兩套墨色用
  const forcedTheme = new URLSearchParams(location.search).get("anim-theme");
  if (forcedTheme === "dark" || forcedTheme === "light") document.documentElement.dataset.theme = forcedTheme;

  const boot = () => { document.querySelectorAll("figure[data-anim]").forEach(mount); bindDialog(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
