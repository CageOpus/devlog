// 倉鼠籠（見 layouts/partials/hamster.html）。
//
// 一隻夜行性的倉鼠，狀態存在 localStorage，整個網域（兩個語言）共用同一隻。分三層：
//   1. 模擬：飽足、水瓶、飼料碗、體力、心情、里程，用固定的每小時變化量推進。
//      頁面看得到時每一格畫面推一點；離開再回來時，以 10 分鐘為一步把中間的時間一次補算完。
//   2. 行為：頁面看得到時，倉鼠一次做一件事（走去碗邊、塞頰囊、搬回窩、跑滾輪、睡覺……），做完再挑下一件。
//   3. 獎勵：瓜子不能買，只能靠「對 devlog 友善的事」換：讀完文章、每天回來、從主畫面開啟、從 RSS 點回來。
//      飼料和水免費、隨時能加；瓜子是零食，會被倉鼠塞進頰囊搬回窩裡囤著，碗空了才吃囤糧。
//
// 倉鼠不會死也不會生病：被冷落只會餓、會鬧脾氣、一直睡。

(function initHamster() {
  const root = document.querySelector("[data-hamster]");
  if (!root) return;

  const KEY = "cage-hamster-v1";
  const STEP_MS = 10 * 60 * 1000; // 離線模擬一步
  const AWAY_SUMMARY_MS = 3 * 60 * 60 * 1000; // 離開超過這麼久，回來時貼一張摘要
  const MAX_CATCH_UP_MS = 60 * 24 * 60 * 60 * 1000; // 最多補算 60 天
  const KM_PER_REV = 0.00063; // 直徑 20 cm 的滾輪轉一圈
  const HOARD_MAX = 99;
  const BOWL_SEEDS_MAX = 5;
  const CHEEK_MAX = 5;

  // 每小時的變化量
  const RATE = {
    awake: { full: -4, bottle: -2.5, bowl: 0, energy: -3 },
    asleep: { full: -1.2, bottle: -0.4, bowl: 0, energy: 14 },
    running: { energy: -9 },
    moodPull: 0.15, // 心情每小時往目標值靠近的比例
  };

  // 里程碑（km）
  const MILESTONES = [
    [1, "第一公里", "First kilometre"],
    [5, "5 公里", "5 K"],
    [10, "10 公里", "10 K"],
    [21.0975, "半程馬拉松", "Half marathon"],
    [42.195, "全程馬拉松", "Marathon"],
    [100, "百公里", "100 km"],
    [500, "五百公里", "500 km"],
    [1000, "千公里", "1,000 km"],
    [5000, "五千公里", "5,000 km"],
    [10000, "萬公里", "10,000 km"],
    [40075, "繞地球一圈", "Around the Earth"],
  ];

  const zh = document.documentElement.lang.toLowerCase().startsWith("zh");
  const STR = zh
    ? {
        defaultName: "夯姆",
        renamePrompt: "幫牠取個名字",
        day: (n) => `第 ${n} 天`,
        meters: { full: "飽足", water: "水瓶", energy: "體力", mood: "心情" },
        food: "加飼料",
        water: "加水",
        seed: (n) => `瓜子 ×${n}`,
        treat: (n) => `零食 ×${n}`,
        logTitle: "紀錄",
        treats: ["麵包蟲", "南瓜子", "花椰菜", "一小塊蘋果"],
        mood: (m) => (m >= 75 ? "很開心" : m >= 50 ? "還不錯" : m >= 30 ? "有點不爽" : "很不爽"),
        doing: {
          sleep: "睡覺中", run: "跑滾輪", eat: "吃飯", stuff: "塞頰囊", stash: "藏糧食", drink: "喝水",
          groom: "理毛", idle: "發呆", walk: "散步", rear: "看著你", dizzy: "頭暈", bite: "生氣", rub: "被吵醒", treat: "吃零食",
        },
        sceneTitle: (name, doing, mood) => `${name}：${doing}，心情${mood}`,
        awayTitle: (d) => `你不在的 ${d}`,
        duration: (h) => (h >= 24 ? `${Math.floor(h / 24)} 天 ${Math.floor(h % 24)} 小時` : `${Math.floor(h)} 小時`),
        away: {
          km: (k) => `跑了 ${k} km`,
          meals: (m, s) => `吃了 ${m} 頓飼料${s ? `、${s} 顆囤糧` : ""}`,
          slept: (h) => `睡了 ${h} 小時`,
          mood: (w) => `現在心情：${w}`,
          bowlEmpty: "碗空了",
          bottleEmpty: "水瓶空了",
        },
        msg: {
          adopt: (n) => `${n} 搬進來了。送你 5 顆瓜子，按「瓜子」放進碗裡。`,
          daily: "每日報到：+3 瓜子",
          read: (t) => `讀完《${t}》：+3 瓜子`,
          tag: (tag, treat) => `第一次讀 ${tag.toUpperCase()} 的文章：拿到${treat}`,
          install: "從主畫面開啟：+10 瓜子",
          rss: "從 RSS 回來讀：+5 瓜子",
          milestone: (name, label) => `里程碑：${name} 跑完${label}`,
          fling: (name, n) => `${name} 被甩出滾輪了（事故第 ${n} 起）`,
          bite: (name) => `${name} 咬了你一口`,
          poke: (name) => `${name} 揉揉眼睛，翻個身繼續睡`,
          stash: (name) => `${name} 把瓜子搬回窩裡藏好了`,
          eatTreat: (name, t) => `${name} 吃掉了${t}，心情大好`,
          foodFull: "碗裝滿了",
          waterFull: "水加滿了",
          seedIn: "放了一顆瓜子到碗裡",
          hungry: (name) => `${name} 餓了，碗裡沒東西`,
          thirsty: (name) => `${name} 口渴，水瓶空了`,
          rename: (name) => `改名為 ${name}`,
          news: (name, t) => `${name} 叼來一張紙條：新文章《${t}》`,
          nap: (name) => `電量低、沒在充電：${name} 先睡了，點一下籠子叫醒牠`,
        },
      }
    : {
        defaultName: "Hamu",
        renamePrompt: "Name your hamster",
        day: (n) => `DAY ${n}`,
        meters: { full: "Full", water: "Water", energy: "Energy", mood: "Mood" },
        food: "Food",
        water: "Water",
        seed: (n) => `Seed ×${n}`,
        treat: (n) => `Treat ×${n}`,
        logTitle: "Log",
        treats: ["a mealworm", "a pumpkin seed", "a broccoli floret", "an apple slice"],
        mood: (m) => (m >= 75 ? "great" : m >= 50 ? "fine" : m >= 30 ? "grumpy" : "sulking"),
        doing: {
          sleep: "sleeping", run: "running", eat: "eating", stuff: "stuffing its cheeks", stash: "hiding food", drink: "drinking",
          groom: "grooming", idle: "sitting", walk: "wandering", rear: "watching you", dizzy: "dizzy", bite: "annoyed", rub: "woken up", treat: "eating a treat",
        },
        sceneTitle: (name, doing, mood) => `${name}: ${doing}, mood ${mood}`,
        awayTitle: (d) => `While you were away (${d})`,
        duration: (h) => (h >= 24 ? `${Math.floor(h / 24)} d ${Math.floor(h % 24)} h` : `${Math.floor(h)} h`),
        away: {
          km: (k) => `Ran ${k} km`,
          meals: (m, s) => `Ate ${m} meals${s ? ` and ${s} hoarded seeds` : ""}`,
          slept: (h) => `Slept ${h} hours`,
          mood: (w) => `Mood now: ${w}`,
          bowlEmpty: "The bowl is empty",
          bottleEmpty: "The bottle is empty",
        },
        msg: {
          adopt: (n) => `${n} moved in. Here are 5 seeds — press Seed to drop one in the bowl.`,
          daily: "Daily visit: +3 seeds",
          read: (t) => `Finished “${t}”: +3 seeds`,
          tag: (tag, treat) => `First ${tag.toUpperCase()} post: got ${treat}`,
          install: "Opened from the home screen: +10 seeds",
          rss: "Came back from RSS: +5 seeds",
          milestone: (name, label) => `Milestone: ${name} ran ${label}`,
          fling: (name, n) => `${name} got flung off the wheel (incident #${n})`,
          bite: (name) => `${name} bit you`,
          poke: (name) => `${name} rubbed its eyes and rolled over`,
          stash: (name) => `${name} hid the seeds in its nest`,
          eatTreat: (name, t) => `${name} ate ${t} and is very pleased`,
          foodFull: "Bowl filled",
          waterFull: "Bottle filled",
          seedIn: "Dropped a seed in the bowl",
          hungry: (name) => `${name} is hungry and the bowl is empty`,
          thirsty: (name) => `${name} is thirsty and the bottle is empty`,
          rename: (name) => `Renamed to ${name}`,
          news: (name, t) => `${name} brought a note: new post “${t}”`,
          nap: (name) => `Low battery, not charging: ${name} is asleep — tap the cage to wake it`,
        },
      };

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const page = JSON.parse(root.querySelector("[data-hamster-page]").textContent || "{}");
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => root.querySelectorAll(sel);
  // 面板每 0.25 秒重畫一次：只在值真的變了才寫進 DOM。就算內容一樣，寫 textContent 也會讓整頁重新排版，
  // iOS Safari 在捲到底、回彈的途中遇到排版，會算錯能捲到哪裡，停在離底部還差一截的地方
  const setText = (el, str) => {
    if (el.textContent !== str) el.textContent = str;
  };
  const setAttr = (el, name, value) => {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };
  const svg = $("[data-ham-scene]");
  const SVGNS = "http://www.w3.org/2000/svg";

  // ═══ 狀態與儲存 ═══

  function fresh(now) {
    return {
      v: 1,
      name: STR.defaultName,
      born: now,
      t: now, // 模擬推進到的時間
      saved: now,
      full: 80, energy: 70, mood: 60, bottle: 100, bowl: 100,
      bowlSeeds: 0, cheek: 0, hoard: 6, seeds: 5, treats: 0,
      km: 0, flings: 0, petAt: now,
      read: {}, tags: {}, claims: {}, latestSeen: null, miles: 0,
      log: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.v === 1) return data;
      }
    } catch (e) {
      // 私密模式或資料壞掉：當成第一次來
    }
    return null;
  }

  function save() {
    state.saved = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // 存不了就只活在這一頁
    }
  }

  const now0 = Date.now();
  let state = load();
  const isNew = !state;
  if (isNew) state = fresh(now0);

  // ═══ 作息 ═══
  // 晚上醒著；清晨與傍晚一半一半；白天大多在睡，偶爾會短暫醒來。用時段算雜湊，同一時段的結果固定，兩個分頁看到的一樣

  function hash(n) {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  function shouldSleep(t, energy) {
    if (energy < 8) return true;
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 19.5 || h < 4.5) return false;
    if (h < 8 || h >= 17) return !(hash(Math.floor(t / 1800000)) < 0.5 && energy > 30);
    return !(hash(Math.floor(t / 900000) + 7) < 0.12 && energy > 60);
  }

  // ═══ 模擬 ═══

  const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

  function moodTarget(t) {
    const attention = 20 * clamp(1 - (t - state.petAt) / 86400000, 0, 1);
    return 30 + (state.full >= 40 ? 25 : state.full >= 15 ? 10 : 0) + (state.bottle > 0 ? 15 : 0) + (state.energy >= 30 ? 10 : 0) + attention;
  }

  // 推進 hours 小時的連續變化（不含吃飯這種離散事件）
  function drift(hours, asleep, running, t) {
    const r = asleep ? RATE.asleep : RATE.awake;
    state.full = clamp(state.full + r.full * hours);
    state.bottle = clamp(state.bottle + r.bottle * hours);
    state.energy = clamp(state.energy + (r.energy + (running ? RATE.running.energy : 0)) * hours);
    state.mood = clamp(state.mood + (moodTarget(t) - state.mood) * Math.min(1, RATE.moodPull * hours));
  }

  // 吃一頓：先吃碗裡的飼料，碗空了才吃囤糧。回傳吃了什麼
  function eatMeal() {
    if (state.bowl >= 5) {
      state.bowl -= 5;
      state.full = clamp(state.full + 15);
      return "bowl";
    }
    if (state.hoard > 0) {
      state.hoard -= 1;
      state.full = clamp(state.full + 10);
      state.mood = clamp(state.mood + 2);
      return "hoard";
    }
    return null;
  }

  // 離線補算：從 state.t 走到 now，每步 10 分鐘
  function catchUp(now) {
    const from = state.t;
    const start = Math.max(from, now - MAX_CATCH_UP_MS);
    const report = { ms: now - from, km: 0, meals: 0, hoardEaten: 0, sleptH: 0 };
    let t = start;
    while (t + STEP_MS <= now) {
      t += STEP_MS;
      const asleep = shouldSleep(t, state.energy);
      let running = false;
      if (asleep) {
        report.sleptH += STEP_MS / 3600000;
      } else {
        // 醒著：碗裡的瓜子先塞頰囊搬回窩
        const carried = state.bowlSeeds + state.cheek;
        state.hoard = Math.min(HOARD_MAX, state.hoard + carried);
        state.bowlSeeds = 0;
        state.cheek = 0;
        if (state.full < 60) {
          const ate = eatMeal();
          if (ate === "bowl") report.meals++;
          if (ate === "hoard") report.hoardEaten++;
        } else if (state.hoard > 0 && state.full < 90 && Math.random() < 1 / 36) {
          // 偶爾嘴饞，從囤糧拿一顆
          state.hoard--;
          state.mood = clamp(state.mood + 4);
          report.hoardEaten++;
        }
        if (state.energy > 25 && state.full > 15 && state.bottle > 0 && Math.random() < 0.55) {
          running = true;
          const km = 0.19 * (0.7 + 0.6 * Math.random());
          state.km += km;
          report.km += km;
        }
      }
      drift(STEP_MS / 3600000, asleep, running, t);
    }
    state.t = Math.max(from, t);
    checkMilestones();
    return report;
  }

  // ═══ 紀錄與提示 ═══

  // 紀錄存的是「訊息種類 + 參數」，畫面上依目前語言組字；兩個語言共用一份紀錄
  function log(kind, args) {
    state.log.unshift({ t: Date.now(), k: kind, a: args || [] });
    state.log.length = Math.min(state.log.length, 30);
    renderLog();
    say(kind, args);
  }

  function text(kind, args) {
    const f = STR.msg[kind];
    return typeof f === "function" ? f(...(args || [])) : f || "";
  }

  let tickerTimer = 0;
  function say(kind, args) {
    const el = $("[data-ham-ticker]");
    el.textContent = text(kind, args);
    el.classList.remove("is-fresh");
    void el.offsetWidth;
    el.classList.add("is-fresh");
    clearTimeout(tickerTimer);
    tickerTimer = setTimeout(() => el.classList.remove("is-fresh"), 2400);
  }

  function checkMilestones() {
    while (state.miles < MILESTONES.length && state.km >= MILESTONES[state.miles][0]) {
      const [, zhLabel, enLabel] = MILESTONES[state.miles];
      state.miles++;
      log("milestone", [state.name, zh ? zhLabel : enLabel]);
    }
  }

  function dateKey(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ═══ 獎勵 ═══

  function grantSeeds(n) {
    state.seeds += n;
    flash("seed");
  }

  function grantTreat() {
    state.treats += 1;
    flash("treat");
    return STR.treats[(state.treats + Object.keys(state.tags).length) % STR.treats.length];
  }

  function flash(act) {
    const btn = $(`[data-ham-act="${act}"]`);
    btn.classList.remove("is-flash");
    void btn.offsetWidth;
    btn.classList.add("is-flash");
  }

  function claimArrivalRewards(now) {
    const today = dateKey(now);
    if (isNew) {
      log("adopt", [state.name]);
    } else if (state.claims.daily !== today) {
      grantSeeds(3);
      log("daily");
    }
    state.claims.daily = today;

    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (standalone && !state.claims.install) {
      state.claims.install = true;
      grantSeeds(10);
      log("install");
    }

    // RSS 的文章連結帶 ?via=rss（見 layouts/_default/rss.xml）：每天第一次從閱讀器點回來給一包，然後把參數從網址拿掉
    const url = new URL(location.href);
    if (url.searchParams.get("via") === "rss") {
      if (state.claims.rss !== today) {
        state.claims.rss = today;
        grantSeeds(5);
        log("rss");
      }
      url.searchParams.delete("via");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
  }

  // 讀完：文章頁尾進入畫面、而且在這頁待了一陣子（避免一打開短文章就領走）
  function watchReading() {
    const post = page.post;
    const footer = document.querySelector(".article__footer");
    if (!post || !post.key || !footer || state.read[post.key]) return;
    const MIN_MS = 20000;
    const opened = Date.now();
    let seen = false;
    const tryClaim = () => {
      if (!seen || state.read[post.key]) return;
      const wait = MIN_MS - (Date.now() - opened);
      if (wait > 0) return setTimeout(tryClaim, wait);
      state.read[post.key] = 1;
      grantSeeds(3);
      log("read", [post.title]);
      for (const tag of post.tags || []) {
        if (state.tags[tag]) continue;
        state.tags[tag] = 1;
        log("tag", [tag, grantTreat()]);
      }
      save();
      renderPanel();
    };
    new IntersectionObserver((entries, io) => {
      if (entries.some((e) => e.isIntersecting)) {
        seen = true;
        io.disconnect();
        tryClaim();
      }
    }).observe(footer);
  }

  // 有新文章：記住看過的最新一篇；第一次來的不提示
  function checkNews() {
    const latest = page.latest;
    const news = $("[data-ham-news]");
    if (!latest || !latest.key) return;
    const onLatest = page.post && page.post.key === latest.key;
    if (state.latestSeen === null || onLatest) state.latestSeen = latest.key;
    if (state.latestSeen === latest.key) {
      news.hidden = true;
      ham.memo = false;
      return;
    }
    news.href = latest.url;
    news.textContent = text("news", [state.name, latest.title]);
    news.hidden = false;
    ham.memo = true;
  }

  // ═══ 行為 ═══

  const FLOOR = 116;
  // 停留點的 x 跟前排籠條一起排過（見 partials/hamster.html）：每個點的眼睛離籠條至少 3.4，改了要重新確認。
  // wheelX 是倉鼠在輪子裡站的位置，不是輪子的圓心（WHEEL_CX）
  const SPOT = { nest: 36, bowl: 66, bottle: 31, wheelDoor: 142, wheelX: 177, wheelY: 110 };
  const WHEEL_CX = 178;
  const WHEEL_CY = 72;
  const ham = {
    x: 100, y: FLOOR, dir: 1, rot: 0,
    inWheel: false,
    pose: "idle", // CSS 姿勢
    queue: [], // 待辦步驟
    step: null,
    memo: false,
    flingT: -1,
    wakeUntil: 0,
  };
  const wheel = { angle: 0, speed: 0 };
  const pointer = { x: null, y: null, inScene: false, since: 0 };

  function asleepNow(t) {
    return t >= ham.wakeUntil && shouldSleep(t, state.energy);
  }

  // busy：這組步驟有目的（拿瓜子、吃飯、睡覺……），游標不能把牠叫走
  function plan(steps, busy = false) {
    ham.queue = steps;
    ham.step = null;
    ham.busy = busy;
  }

  function act(pose, dur, onEnd) {
    return { pose, dur, onEnd };
  }

  // 做完上一件事，挑下一件
  function decide(t) {
    const keepRunning = state.energy > 20 && !asleepNow(t) && state.bowlSeeds === 0 && Math.random() < 0.5;
    if (ham.inWheel && !keepRunning) {
      return plan([{ hop: "out" }, act("idle", 0.6)], true);
    }
    if (asleepNow(t)) {
      if (ham.pose === "sleep") return plan([act("sleep", 30)], true);
      return plan([{ walk: SPOT.nest }, act("sleep", 30)], true);
    }
    if (ham.inWheel) return plan([act("run", 8 + Math.random() * 20)]);

    if (state.bowlSeeds > 0 && state.cheek < CHEEK_MAX) {
      return plan([{ walk: SPOT.bowl, face: 1 }, act("stuff", 1.6, stuffCheeks)], true);
    }
    if (state.cheek > 0) {
      return plan([{ walk: SPOT.nest + 6, face: -1 }, act("stash", 2.2, stashCheeks)], true);
    }
    if (state.full < 60) {
      if (state.bowl >= 5) return plan([{ walk: SPOT.bowl, face: 1 }, act("eat", 3, eatMeal)], true);
      if (state.hoard > 0) return plan([{ walk: SPOT.nest + 6, face: -1 }, act("eat", 3, eatMeal)], true);
      if (Math.random() < 0.3) say("hungry", [state.name]);
    }
    if (state.bottle > 0 && t - (ham.lastDrink || 0) > 90000 && Math.random() < 0.35) {
      ham.lastDrink = t;
      return plan([{ walk: SPOT.bottle, face: -1 }, act("drink", 2.4, () => (state.bottle = clamp(state.bottle - 0.5)))], true);
    }
    if (state.bottle <= 0 && Math.random() < 0.2) say("thirsty", [state.name]);

    const r = Math.random();
    const canRun = state.energy > 25 && state.full > 15 && state.bottle > 0;
    if (canRun && r < 0.45) return plan([{ walk: SPOT.wheelDoor, face: 1 }, { hop: "in" }, act("run", 10 + Math.random() * 25)]);
    if (r < 0.65) {
      const x = 50 + Math.random() * 80;
      return plan([{ walk: clearSpot(x, Math.sign(x - ham.x) || ham.dir, ["idle"]) }, act("idle", 1 + Math.random() * 2)]);
    }
    if (r < 0.8) return plan([act("groom", 2.5 + Math.random() * 2)]);
    return plan([act("idle", 2 + Math.random() * 3)]);
  }

  // ═══ 構圖：停下來的時候，眼睛不能被前排籠條擋住 ═══
  // 各姿勢下眼睛在倉鼠自己座標裡的 x 範圍（面向右；含瞳孔、啃東西時的晃動、站起來或低頭的旋轉）。
  // 固定的停留點在 partials/hamster.html 排籠條時就避開了；這裡處理散步、跟著游標、逃跑、落地這些不固定的位置
  const EYE = {
    idle: [11.3, 17.4], // 含理毛時往後仰
    rear: [2.1, 5.9],
    eat: [13.6, 18.5],
    dizzy: [13.6, 17.4],
  };
  const BARS = [...svg.querySelectorAll("[data-ham-front-bars] rect")].map((r) => {
    const x = Number(r.getAttribute("x"));
    return [x, x + Number(r.getAttribute("width"))];
  });

  function eyeClear(x, dir, poses) {
    const MARGIN = 0.8;
    return poses.every((pose) => {
      const [lo, hi] = EYE[pose];
      const a = Math.min(x + lo * dir, x + hi * dir) - MARGIN;
      const b = Math.max(x + lo * dir, x + hi * dir) + MARGIN;
      return BARS.every(([l, r]) => r < a || l > b);
    });
  }

  // 從 x 往兩側找最近的乾淨位置（最多挪 12），找不到就照原位
  function clearSpot(x, dir, poses, lo = 50, hi = 132) {
    for (let d = 0; d <= 12; d += 0.5) {
      for (const c of d ? [x + d, x - d] : [x]) {
        if (c >= lo && c <= hi && eyeClear(c, dir, poses)) return c;
      }
    }
    return x;
  }

  function stuffCheeks() {
    const n = Math.min(state.bowlSeeds, CHEEK_MAX - state.cheek);
    state.bowlSeeds -= n;
    state.cheek += n;
  }

  function stashCheeks() {
    if (state.cheek === 0) return;
    state.hoard = Math.min(HOARD_MAX, state.hoard + state.cheek);
    state.cheek = 0;
    say("stash", [state.name]);
  }

  // 每一格畫面推進一步。tp 是 performance.now()（游標計時），t 是 Date.now()（作息）
  function stepBrain(dt, tp, t) {
    if (ham.flingT >= 0) return stepFling(dt);

    // 游標停在籠子裡一陣子：醒著、手上沒事的話，走過去站起來看
    const interruptible = !ham.busy && !ham.inWheel && ["idle", "groom", "walk"].includes(ham.pose) && !asleepNow(t);
    if (pointer.inScene && interruptible && tp - pointer.since > 600) {
      const target = clamp(pointer.x, 50, 132);
      const face = Math.sign(pointer.x - target) || ham.dir;
      plan([{ walk: clearSpot(target, face, ["rear", "idle"]), face }, act("rear", 6)]);
    }
    if (ham.pose === "rear" && !pointer.inScene && ham.step && ham.step.pose === "rear") ham.step.dur = 0;

    if (!ham.step) {
      if (!ham.queue.length) decide(t);
      if (!ham.queue.length) return;
      ham.step = ham.queue.shift();
      ham.step.t = 0;
      if (ham.step.hop) ham.step.from = { x: ham.x, y: ham.y };
    }
    const s = ham.step;
    s.t += dt;

    if (s.walk !== undefined) {
      const dx = s.walk - ham.x;
      const speed = 30;
      if (Math.abs(dx) <= speed * dt) {
        ham.x = s.walk;
        if (s.face) ham.dir = s.face;
        ham.step = null;
      } else {
        ham.dir = Math.sign(dx);
        ham.x += ham.dir * speed * dt;
        ham.pose = "walk";
      }
      return;
    }

    if (s.hop) {
      // 跳進或跳出滾輪：一段拋物線
      const dur = 0.45;
      const k = Math.min(1, s.t / dur);
      const to = s.hop === "in" ? { x: SPOT.wheelX, y: SPOT.wheelY } : { x: SPOT.wheelDoor, y: FLOOR };
      ham.x = s.from.x + (to.x - s.from.x) * k;
      ham.y = s.from.y + (to.y - s.from.y) * k - Math.sin(k * Math.PI) * 14;
      ham.pose = "walk";
      if (k >= 1) {
        ham.inWheel = s.hop === "in";
        ham.dir = 1;
        ham.step = null;
      }
      return;
    }

    ham.pose = s.pose;
    if (s.t >= s.dur) {
      ham.step = null;
      if (s.onEnd) s.onEnd();
    }
  }

  // ═══ 滾輪與甩飛 ═══

  function stepWheel(dt) {
    const running = ham.inWheel && ham.pose === "run";
    const target = running ? (state.energy > 40 ? 360 : 250) : 0;
    if (wheel.speed < target) wheel.speed = Math.min(target, wheel.speed + 400 * dt);
    else wheel.speed = Math.max(target, wheel.speed - (running ? 260 : 160) * dt);
    // 倉鼠往右跑，腳下的輪面往左走：輪子逆時針轉
    wheel.angle = (wheel.angle - wheel.speed * dt) % 360;
    if (ham.inWheel) {
      state.km += (wheel.speed * dt / 360) * KM_PER_REV;
      if (wheel.speed > 1150 && ham.flingT < 0) startFling();
    }
  }

  function boostWheel() {
    wheel.speed += 240;
  }

  // ═══ 音效 ═══
  // 只有訪客自己動手時才出聲（點擊本身就是使用者操作，瀏覽器允許播放）；倉鼠自己做的事都是安靜的。
  // 全部用 Web Audio 現場合成，不載音檔：
  //   滾輪：手指敲上去的一聲悶響，接著輪框每轉 30° 咔一下，間隔照點完之後的轉速往下減速算；點得越兇越密、越長
  //   飼料：從袋子倒進碗裡，一陣嘩啦啦的顆粒聲，越後面越疏
  //   瓜子：掉進陶瓷碗，彈兩三下
  //   加水：一串氣泡，音高隨水位往上爬
  let audio = null;
  let noiseBuffer = null;

  // 第一次建立 AudioContext 要等音訊裝置開起來，很慢：滑鼠第一次移進籠子（整個 widget）時就先在背景建好，
  // 順便把噪聲緩衝生出來。hover 不算使用者操作，建好的 context 先停在 suspended；
  // 按下去（pointerdown，比 click 早）就喚醒，等 click 真的要出聲時裝置已經在跑了
  function ensureAudio() {
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      noise(audio);
      return audio;
    } catch (e) {
      return null;
    }
  }

  root.addEventListener("pointerenter", ensureAudio, { once: true });
  root.addEventListener("pointerdown", () => {
    if (ensureAudio()?.state === "suspended") audio.resume();
  });

  function play(sound, ...args) {
    if (!ensureAudio()) return;
    if (audio.state === "suspended") audio.resume();
    sound(audio, audio.destination, audio.currentTime + 0.01, ...args);
  }

  function spinSound(ctx, dest, t0, speed) {
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(dest);
    clank(ctx, out, t0);

    // 從點完之後的轉速開始，照空輪的摩擦（每秒少 160°）減速，每經過 30° 排一聲咔
    const FRICTION = 160;
    let v = Math.min(speed, 1400);
    let t = 0;
    let travelled = 0;
    let next = 30;
    while (v > 50 && t < 2) {
      const dt = 0.004;
      travelled += v * dt;
      t += dt;
      v -= FRICTION * dt;
      if (travelled >= next) {
        next += 30;
        tick(ctx, out, t0 + t, Math.min(1, v / 500));
      }
    }
    setTimeout(() => out.disconnect(), (t + 0.5) * 1000);
  }

  function noise(ctx) {
    if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  function envelope(ctx, dest, t, peak, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(dest);
    return g;
  }

  // 手指敲到鐵輪：一聲短促的悶響，不帶金屬的餘音
  function clank(ctx, dest, t) {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 900;
    band.Q.value = 1.2;
    src.connect(band).connect(envelope(ctx, dest, t, 0.5, 0.05));
    src.start(t);
    src.stop(t + 0.07);
  }

  // 輪框的鐵線經過支架：一聲很短的咔，帶一點點金屬的泛音
  function tick(ctx, dest, t, intensity) {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2600 + Math.random() * 900;
    band.Q.value = 5;
    src.connect(band).connect(envelope(ctx, dest, t, 0.35 * intensity + 0.08, 0.025));
    src.start(t, Math.random() * 0.04);
    src.stop(t + 0.03);
    const ping = ctx.createOscillator();
    ping.frequency.value = 3300 + Math.random() * 200;
    ping.connect(envelope(ctx, dest, t, 0.025 * intensity + 0.005, 0.04));
    ping.start(t);
    ping.stop(t + 0.05);
  }

  // 瓜子掉進陶瓷碗：清脆的一下，再彈兩下，一下比一下輕、間隔一下比一下短
  function seedSound(ctx, dest, t0) {
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(dest);
    const bounces = [[0, 1], [0.085, 0.45], [0.14, 0.2]];
    for (const [dt, level] of bounces) {
      const t = t0 + dt;
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 4200 + Math.random() * 600;
      band.Q.value = 8;
      src.connect(band).connect(envelope(ctx, out, t, 0.45 * level, 0.018));
      src.start(t, Math.random() * 0.04);
      src.stop(t + 0.025);
      // 陶瓷碗本身的一點共鳴
      const body = ctx.createOscillator();
      body.type = "triangle";
      body.frequency.value = 2100;
      body.connect(envelope(ctx, out, t, 0.04 * level, 0.06));
      body.start(t);
      body.stop(t + 0.07);
    }
    setTimeout(() => out.disconnect(), 600);
  }

  // 加飼料：一把飼料倒進陶瓷碗。顆粒的間隔從密到疏、一顆比一顆輕，
  // 比瓜子低一點、乾一點；底下墊一層很輕的沙沙聲，是飼料從袋口滑出來
  function foodSound(ctx, dest, t0) {
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(dest);

    const DURATION = 0.7;
    const pour = ctx.createBufferSource();
    pour.buffer = noise(ctx);
    pour.loop = true;
    const hiss = ctx.createBiquadFilter();
    hiss.type = "bandpass";
    hiss.frequency.value = 3200;
    hiss.Q.value = 0.8;
    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0, t0);
    hissGain.gain.linearRampToValueAtTime(0.04, t0 + 0.05);
    hissGain.gain.exponentialRampToValueAtTime(0.0001, t0 + DURATION);
    pour.connect(hiss).connect(hissGain).connect(out);
    pour.start(t0);
    pour.stop(t0 + DURATION + 0.05);

    let t = 0;
    while (t < DURATION) {
      const k = t / DURATION;
      const level = (1 - k) * (0.6 + Math.random() * 0.4);
      const at = t0 + t;
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 2000 + Math.random() * 1400;
      band.Q.value = 6;
      src.connect(band).connect(envelope(ctx, out, at, 0.42 * level + 0.03, 0.015));
      src.start(at, Math.random() * 0.05);
      src.stop(at + 0.02);
      // 大約三顆裡有一顆敲到碗壁，帶出一點陶瓷的共鳴
      if (Math.random() < 0.35) {
        const body = ctx.createOscillator();
        body.type = "triangle";
        body.frequency.value = 1900 + Math.random() * 300;
        body.connect(envelope(ctx, out, at, 0.025 * level, 0.05));
        body.start(at);
        body.stop(at + 0.06);
      }
      // 開頭每 8–20 ms 一顆，到最後拉長到 60–110 ms
      t += 0.008 + k * k * 0.06 + Math.random() * (0.012 + k * 0.05);
    }
    setTimeout(() => out.disconnect(), (DURATION + 0.5) * 1000);
  }

  // 加水：一串氣泡，每個泡泡是一段往上滑的正弦；整串的音高隨水位升高
  function waterSound(ctx, dest, t0) {
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(dest);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2400;
    lowpass.connect(out);
    const COUNT = 9;
    let t = t0;
    for (let i = 0; i < COUNT; i++) {
      const fill = i / (COUNT - 1);
      const base = 320 + fill * 380 + Math.random() * 60;
      const len = 0.05 + Math.random() * 0.03;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 2.1, t + len);
      osc.connect(envelope(ctx, lowpass, t, 0.16 * (1 - fill * 0.4), len));
      osc.start(t);
      osc.stop(t + len + 0.02);
      t += 0.055 + Math.random() * 0.06;
    }
    setTimeout(() => out.disconnect(), (t - t0 + 0.4) * 1000);
  }

  function startFling() {
    state.flings += 1;
    log("fling", [state.name, state.flings]);
    state.mood = clamp(state.mood - 4);
    ham.flingT = reducedMotion ? 0.9 : 0; // 減少動態時跳過甩一圈，直接落地
    ham.queue = [];
    ham.step = null;
    ham.pose = "fling";
  }

  // 0–0.6 s：被輪面帶著轉一圈多；0.6–1.45 s：從左側飛出去；然後暈 3.5 秒
  function stepFling(dt) {
    ham.flingT += dt;
    const t = ham.flingT;
    const R = 38;
    if (t < 0.6) {
      const phi = (t / 0.6) * Math.PI * 2.5;
      ham.x = WHEEL_CX - R * Math.sin(phi);
      ham.y = WHEEL_CY + R * Math.cos(phi);
      ham.rot = (phi * 180) / Math.PI;
      return;
    }
    ham.inWheel = false;
    if (t < 1.45) {
      const f = t - 0.6;
      ham.x = WHEEL_CX - R - 60 * f;
      ham.y = Math.min(FLOOR, WHEEL_CY - 80 * f + 150 * f * f);
      ham.rot = 90 + 900 * f;
      return;
    }
    ham.y = FLOOR;
    ham.rot = 0;
    ham.dir = -1;
    ham.x = clearSpot(Math.max(ham.x, 50), -1, ["dizzy", "idle"]);
    ham.flingT = -1;
    plan([act("dizzy", 3.5), act("idle", 1)]);
  }

  // ═══ 互動 ═══

  function svgPoint(evt) {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  document.addEventListener(
    "pointermove",
    (evt) => {
      const p = svgPoint(evt);
      if (!p) return;
      pointer.x = p.x;
      pointer.y = p.y;
      const inside = p.x >= 6 && p.x <= 234 && p.y >= 8 && p.y <= 134 && evt.pointerType === "mouse";
      if (inside && !pointer.inScene) pointer.since = performance.now();
      pointer.inScene = inside;
    },
    { passive: true },
  );
  svg.addEventListener("pointerleave", () => (pointer.inScene = false));

  // 摸：滑鼠停在倉鼠身上每秒加一點心情，連續摸超過 5 秒會被咬；觸控是點一下摸一下
  const hamEl = $("[data-ham]");
  let petStart = 0;
  let petAccum = 0;

  hamEl.addEventListener("pointerenter", (evt) => {
    if (evt.pointerType === "mouse") petStart = performance.now();
  });
  hamEl.addEventListener("pointerleave", () => (petStart = 0));
  hamEl.addEventListener("click", (evt) => {
    evt.stopPropagation();
    const t = Date.now();
    if (ham.flingT >= 0) return;
    if (ham.pose === "sleep") {
      plan([act("rub", 1.4), act("sleep", 30)], true);
      ham.dir *= -1;
      log("poke", [state.name]);
      return;
    }
    pet(t, 3);
    bubble("♥");
  });

  function pet(t, amount) {
    state.petAt = t;
    state.mood = clamp(state.mood + amount);
  }

  function stepPetting(dt, t) {
    if (!petStart || ham.pose === "sleep" || ham.flingT >= 0) return;
    petAccum += dt;
    if (petAccum >= 1) {
      petAccum = 0;
      pet(Date.now(), 1);
    }
    if (t - petStart > 5000 && !ham.inWheel) {
      petStart = 0;
      state.mood = clamp(state.mood - 3);
      log("bite", [state.name]);
      bubble(zh ? "咬！" : "Chomp!");
      const away = ham.x < 90 ? 128 : 52;
      plan([act("bite", 0.8), { walk: clearSpot(away, Math.sign(away - ham.x) || 1, ["idle"]) }, act("idle", 2)], true);
    }
  }

  $("[data-ham-wheel-hit]").addEventListener("click", (evt) => {
    evt.stopPropagation();
    boostWheel();
    play(spinSound, wheel.speed);
  });

  let bubbleTimer = 0;
  function bubble(str) {
    const el = $("[data-ham-bubble]");
    el.textContent = str;
    el.classList.add("is-on");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => el.classList.remove("is-on"), 1300);
  }

  // 作弊：按住 Option / Alt 再按操作鍵，只播那顆鍵的音效，不動任何狀態（調音效用）。
  // 停用的鍵平常被 CSS 擋掉滑鼠，按住 Option 時 .is-previewing 會把它放開
  const PREVIEW = { food: foodSound, seed: seedSound, water: waterSound };

  function setPreviewing(on) {
    root.classList.toggle("is-previewing", on);
  }
  addEventListener("keydown", (e) => e.key === "Alt" && setPreviewing(true));
  addEventListener("keyup", (e) => e.key === "Alt" && setPreviewing(false));
  addEventListener("blur", () => setPreviewing(false));

  $$("[data-ham-act]").forEach((btn) =>
    btn.addEventListener("click", (evt) => {
      const kind = btn.dataset.hamAct;
      if (evt.altKey) {
        if (PREVIEW[kind]) play(PREVIEW[kind]);
        return;
      }
      // 停用的鍵滑鼠點不到（CSS 擋掉），但鍵盤還按得到
      if (btn.getAttribute("aria-disabled") === "true") return;
      if (kind === "food") {
        state.bowl = 100;
        say("foodFull");
        play(foodSound);
      } else if (kind === "water") {
        state.bottle = 100;
        say("waterFull");
        play(waterSound);
      } else if (kind === "seed") {
        if (state.seeds <= 0 || state.bowlSeeds >= BOWL_SEEDS_MAX) return;
        state.seeds--;
        state.bowlSeeds++;
        say("seedIn");
        play(seedSound);
        // 醒著而且手上沒事就馬上過來拿；在跑滾輪的話，再跑一下就下來
        if (["idle", "groom", "walk", "rear"].includes(ham.pose) && !ham.inWheel && !ham.busy) plan([]);
        if (ham.step && ham.step.pose === "run") ham.step.dur = Math.min(ham.step.dur, ham.step.t + 1.5);
      } else if (kind === "treat") {
        if (state.treats <= 0) return;
        state.treats--;
        const name = STR.treats[Math.floor(Math.random() * STR.treats.length)];
        // 零食會把睡著的倉鼠叫醒，醒兩分鐘
        ham.wakeUntil = Date.now() + 120000;
        const eat = () => {
          state.full = clamp(state.full + 20);
          state.mood = clamp(state.mood + 25);
          state.petAt = Date.now();
          say("eatTreat", [state.name, name]);
        };
        if (ham.flingT >= 0) {
          eat(); // 正在飛，落地後才吃也一樣
        } else {
          plan([...(ham.inWheel ? [{ hop: "out" }] : []), act("treat", 2.6, eat)], true);
        }
      }
      save();
      renderPanel();
    }),
  );

  // 改名：名字鍵換成輸入框，Enter 或離開時存
  const nameBtn = $("[data-ham-rename]");
  nameBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.className = "hamster__name-input";
    input.value = state.name;
    input.maxLength = 16;
    input.setAttribute("aria-label", STR.renamePrompt);
    nameBtn.hidden = true;
    nameBtn.after(input);
    input.focus();
    input.select();
    let done = false;
    const commit = (keep) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (keep && name && name !== state.name) {
        state.name = name;
        log("rename", [name]);
        save();
      }
      input.remove();
      nameBtn.hidden = false;
      renderPanel();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit(true);
      if (e.key === "Escape") commit(false);
    });
    input.addEventListener("blur", () => commit(true));
  });

  // 不在期間的摘要
  function showAway(report) {
    if (report.ms < AWAY_SUMMARY_MS) return;
    const box = $("[data-ham-away]");
    $("[data-ham-away-title]").textContent = STR.awayTitle(STR.duration(report.ms / 3600000));
    const lines = [
      STR.away.km(report.km.toFixed(1)),
      STR.away.meals(report.meals, report.hoardEaten),
      STR.away.slept(Math.round(report.sleptH)),
      STR.away.mood(STR.mood(state.mood)),
    ];
    if (state.bowl < 5) lines.push(STR.away.bowlEmpty);
    if (state.bottle <= 0) lines.push(STR.away.bottleEmpty);
    const list = $("[data-ham-away-list]");
    list.replaceChildren(...lines.map((l) => Object.assign(document.createElement("li"), { textContent: l })));
    box.hidden = false;
  }
  $("[data-ham-away-close]").addEventListener("click", () => ($("[data-ham-away]").hidden = true));

  // ═══ 畫面 ═══

  const els = {
    ham: hamEl,
    pose: $("[data-ham-pose]"),
    pupil: $("[data-ham-pupil]"),
    cheek: $("[data-ham-cheek]"),
    wheel: $("[data-ham-wheel]"),
    water: $("[data-ham-water]"),
    odo: $("[data-ham-odo]"),
    bubble: $("[data-ham-bubble]"),
    title: $("[data-ham-scene-title]"),
  };

  function drawScene() {
    setAttr(els.wheel, "transform", `rotate(${wheel.angle.toFixed(2)} 178 72)`);
    setAttr(els.ham, "transform", `translate(${ham.x.toFixed(2)} ${ham.y.toFixed(2)}) rotate(${ham.rot.toFixed(1)}) scale(${ham.dir} 1)`);
    if (els.ham.dataset.pose !== ham.pose) els.ham.dataset.pose = ham.pose;
    els.ham.classList.toggle("has-memo", ham.memo && ham.pose !== "sleep");
    const s = 1 + state.cheek * 0.12;
    setAttr(els.cheek, "transform", `translate(14.5 -9.5) scale(${s}) translate(-14.5 9.5)`);

    // 眼睛跟著游標：瞳孔最多偏 0.7（倉鼠面向左時 x 要反過來）
    if (pointer.x !== null) {
      const ex = ham.x + 15.5 * ham.dir;
      const ey = ham.y - 15;
      const dx = (pointer.x - ex) * ham.dir;
      const dy = pointer.y - ey;
      const len = Math.hypot(dx, dy) || 1;
      setAttr(els.pupil, "transform", `translate(${((dx / len) * 0.7).toFixed(2)} ${((dy / len) * 0.7).toFixed(2)})`);
    }
    setAttr(els.bubble, "x", clamp(ham.x, 20, 220).toFixed(1));
    setAttr(els.bubble, "y", (ham.y - 34).toFixed(1));
  }

  // 數值、按鍵、碗、水瓶、囤糧：一秒畫幾次就夠
  function renderPanel() {
    setText(nameBtn, state.name);
    setText($("[data-ham-age]"), STR.day(Math.floor((Date.now() - state.born) / 86400000) + 1));
    const meters = { full: state.full, water: state.bottle, energy: state.energy, mood: state.mood };
    for (const [k, v] of Object.entries(meters)) {
      setText($(`[data-ham-meter-label="${k}"]`), STR.meters[k]);
      const fill = $(`[data-ham-meter="${k}"]`);
      const width = `${v.toFixed(1)}%`;
      if (fill.style.width !== width) fill.style.width = width;
      fill.classList.toggle("is-low", v < 20);
    }
    setText(els.odo, state.km.toFixed(3).padStart(9, "0"));

    const btn = (k) => $(`[data-ham-act="${k}"]`);
    setText(btn("food"), STR.food);
    setAttr(btn("food"), "aria-disabled", String(state.bowl >= 95));
    setText(btn("water"), STR.water);
    setAttr(btn("water"), "aria-disabled", String(state.bottle >= 95));
    setText(btn("seed"), STR.seed(state.seeds));
    setAttr(btn("seed"), "aria-disabled", String(state.seeds <= 0 || state.bowlSeeds >= BOWL_SEEDS_MAX));
    setText(btn("treat"), STR.treat(state.treats));
    if (btn("treat").hidden !== state.treats <= 0) btn("treat").hidden = state.treats <= 0;

    setAttr(els.water, "y", (16 + 44 * (1 - state.bottle / 100)).toFixed(1));
    drawPile($("[data-ham-pellets]"), Math.ceil(state.bowl / 100 * 7), pelletAt, "ham-pellet", "circle");
    drawPile($("[data-ham-bowl-seeds]"), state.bowlSeeds, bowlSeedAt, "ham-seed", "use");
    drawPile($("[data-ham-hoard]"), Math.min(state.hoard, 15), hoardAt, "ham-seed", "use");

    const doing = STR.doing[ham.pose === "fling" ? "dizzy" : ham.pose] || STR.doing.idle;
    setText(els.title, STR.sceneTitle(state.name, doing, STR.mood(state.mood)));
  }

  const pelletAt = (i) => [76 + (i % 4) * 7 + (i > 3 ? 3.5 : 0), 106 - (i > 3 ? 3.2 : 0)];
  const bowlSeedAt = (i) => [80 + i * 4.5, 102.5];
  // 囤糧堆成一座小丘：底層 6、上一層 5、再上 4
  const hoardAt = (i) => {
    const row = i < 6 ? 0 : i < 11 ? 1 : 2;
    const col = row === 0 ? i : row === 1 ? i - 6 : i - 11;
    return [30 + row * 2.5 + col * 5, 113 - row * 3.6];
  };

  function drawPile(group, n, at, cls, tag) {
    if (group.childElementCount === n) return;
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = at(i);
      const el = document.createElementNS(SVGNS, tag);
      el.setAttribute("class", cls);
      if (tag === "circle") {
        el.setAttribute("cx", x);
        el.setAttribute("cy", y);
        el.setAttribute("r", 2.3);
      } else {
        el.setAttribute("href", "#hamSeed");
        el.setAttribute("transform", `translate(${x} ${y}) rotate(${(i * 47) % 180 - 90})`);
      }
      nodes.push(el);
    }
    group.replaceChildren(...nodes);
  }

  function renderLog() {
    $("[data-ham-log-title]").textContent = STR.logTitle;
    const list = $("[data-ham-log]");
    list.replaceChildren(
      ...state.log.map((e) => {
        const li = document.createElement("li");
        const d = new Date(e.t);
        const time = document.createElement("time");
        time.dateTime = d.toISOString();
        time.textContent = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        li.append(time, " ", text(e.k, e.a));
        return li;
      }),
    );
  }

  // ═══ 主迴圈 ═══

  let last = performance.now();
  let panelClock = 0;
  let saveClock = 0;
  let running = false;

  function frame(nowPerf) {
    if (!running) return;
    const dt = Math.min(0.1, (nowPerf - last) / 1000);
    last = nowPerf;
    const t = Date.now();

    stepBrain(dt, nowPerf, t);
    stepWheel(dt);
    stepPetting(dt, nowPerf);
    const asleep = ham.pose === "sleep" || ham.pose === "rub";
    drift(dt / 3600, asleep, ham.inWheel && ham.pose === "run", t);
    state.t = t;
    checkMilestones();

    drawScene();
    panelClock += dt;
    if (panelClock > 0.25) {
      panelClock = 0;
      renderPanel();
    }
    saveClock += dt;
    if (saveClock > 5) {
      saveClock = 0;
      save();
    }
    requestAnimationFrame(frame);
  }

  // fromNap：從省電睡眠叫醒。訪客一直都在頁面上，補算照做，但不貼「你不在的期間」
  function resume(fromNap = false) {
    if (running || powerNap) return;
    const now = Date.now();
    // 離開超過一分鐘就當成離線，用步進補算；剛剛才在的話直接接上
    if (now - state.t > 60000) {
      const report = catchUp(now);
      if (!fromNap) showAway(report);
      // 回來時倉鼠在哪：睡著的話在窩裡，醒著就隨便一個位置
      ham.inWheel = false;
      ham.rot = 0;
      ham.y = FLOOR;
      ham.x = asleepNow(now) ? SPOT.nest : clearSpot(60 + Math.random() * 60, ham.dir, ["idle"]);
      ham.pose = asleepNow(now) ? "sleep" : "idle";
      plan([]);
    }
    state.t = now;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // ═══ 省電 ═══
  // 網頁讀不到瀏覽器的省電模式，用電池狀態近似：沒在充電、電量 ≤ 20%（Chrome 預設在這時自動開節約能源）。
  // 只有 Chromium 有 navigator.getBattery；Safari、Firefox 讀不到就照常。
  // 判定省電時，倉鼠回窩裡睡，動畫迴圈與 CSS 動畫全部停下；訪客碰一下籠子才醒，醒了之後這一頁就不再進省電睡眠
  let powerNap = false;
  let wokenByUser = false;

  function enterNap() {
    if (powerNap || wokenByUser) return;
    pause();
    powerNap = true;
    plan([]);
    ham.inWheel = false;
    ham.flingT = -1;
    ham.rot = 0;
    ham.x = SPOT.nest;
    ham.y = FLOOR;
    ham.pose = "sleep";
    wheel.speed = 0;
    root.classList.add("is-napping");
    drawScene();
    renderPanel();
    say("nap", [state.name]);
  }

  function wakeFromNap() {
    if (!powerNap) return;
    powerNap = false;
    wokenByUser = true;
    root.classList.remove("is-napping");
    resume(true);
    // 先揉眼睛；姿勢立刻換掉，接下來的 click 才不會被當成「戳睡著的倉鼠」
    ham.pose = "rub";
    plan([act("rub", 1.4)], true);
  }

  root.addEventListener("pointerdown", wakeFromNap, true);
  root.addEventListener("keydown", wakeFromNap, true);

  if (navigator.getBattery) {
    navigator.getBattery().then((battery) => {
      const check = () => {
        if (!battery.charging && battery.level <= 0.2) enterNap();
      };
      check();
      battery.addEventListener("chargingchange", check);
      battery.addEventListener("levelchange", check);
    }, () => {});
  }

  function pause() {
    running = false;
    save();
  }

  // 另一個分頁存了比較新的狀態：接過來（倉鼠的位置與動作留在這一頁）
  addEventListener("storage", (evt) => {
    if (evt.key !== KEY || !evt.newValue) return;
    try {
      const next = JSON.parse(evt.newValue);
      if (next && next.v === 1 && next.saved > state.saved) {
        state = next;
        renderPanel();
        renderLog();
      }
    } catch (e) {
      // 忽略壞掉的資料
    }
  });

  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()));
  addEventListener("pagehide", save);

  // ═══ 開始 ═══
  root.hidden = false;
  const startAsleep = asleepNow(now0);
  ham.x = startAsleep ? SPOT.nest : clearSpot(70 + Math.random() * 50, ham.dir, ["idle"]);
  ham.pose = startAsleep ? "sleep" : "idle";
  if (!isNew && now0 - state.t > 60000) {
    showAway(catchUp(now0));
  }
  state.t = now0;
  claimArrivalRewards(now0);
  checkNews();
  watchReading();
  renderLog();
  // 這次進來沒有新消息的話，消息列先放最近一則紀錄
  if (!$("[data-ham-ticker]").textContent && state.log[0]) $("[data-ham-ticker]").textContent = text(state.log[0].k, state.log[0].a);
  renderPanel();
  drawScene();
  save();
  if (!document.hidden) resume();
  if (ham.memo) bubble("!");
})();
