/* ANIM：一個 tick 裡 proposal 走過的路——請求（request）→ 依 lane 分組 → coordinate → integrate。
   數字是真的照 kernel 規則算出來的（generate_proposals / coordinate / integrate_agents）：
   5 m micro-lane、claim 255、extension (tier<<4)+decay（CarNormal tier 2，decay 從 30 起每格減一）、
   輸家截在贏家起點、atomicMin 取 (ring<<16)|progress、60 % cap（body 4.5 m × 1.1 + 60 % 餘裕）。
   counting sort（count → prefix sum → scatter）不拆開演，只演結果：每筆 proposal 落到自己 lane 的那一欄。
   coordinate 照 cage-tiny PR #58（併入 #62）的版本：一筆 proposal 一個執行緒，掃自己 lane 那一桶，
   在「重疊且贏過我」的對手裡取 min(max(start_o, start_me))，最後一次 atomicMin；沒有 per-lane workgroup、也不排序。 */
(() => {
  const TA = window.TrafficAnim;
  const { el, set, text, C, track, lerp } = TA;

  TA.scenes.request = (svg) => {
    const W = 680, H = 408;
    const tl = TA.timeline([
      { d: 3.2, en: "Three cars, one lane. We split the lane into 5 m sections called micro-lanes. The cars never look at each other—they just ask the road for space.", zh: "先看這三台車。我們把車道每 5 公尺切成一小段，叫做迷你車道。它們不靠觀察其他車來決定怎麼走，而是各自向道路申請空間。" },
      { d: 3.4, en: "At the start of each tick, every car asks to keep the road space it already holds—its claim—at the highest priority, 255. Skip a tick, and that space is no longer reserved for it.", zh: "每個 tick 一開始，車子都會先送出最高優先序（255）的請求，繼續保留原本的路段（claim）。一旦不再送出請求，這段空間就不再替它保留。" },
      { d: 3.8, en: "Next, each car asks for more road ahead—an extension. Priority drops by one for each micro-lane further ahead, so the front car always has priority over the car behind for the same stretch of road.", zh: "接著，車子會申請前方的空間，讓保留範圍繼續往前延伸（extension）。每往前一格迷你車道，請求的優先序就降一級。所以對同一段路，前車的請求總是比後車優先。" },
      { d: 3.2, en: "A request can span several micro-lanes, so we split it at their boundaries into individual proposals. Each proposal records the requested range, its priority, and the car making the request.", zh: "一個請求可能橫跨好幾個迷你車道，我們會沿著每格的邊界，把它拆成數筆提案（proposals）。提案會記錄用到的區間、優先序，以及是哪台車提出的。" },
      { d: 4.0, en: "Then we use a little magic to organise the proposals.", zh: "接著使用一些魔法，整理這些提案。", tip: { en: ["a little magic", "Counting sort orders the proposals by micro-lane ID, end position (progress), and priority. Packing these fields together (bit packing) makes it straightforward to identify which proposal takes precedence."], zh: ["一些魔法", "使用 counting sort，依迷你車道 ID、區間終點（progress）和優先序排列提案。將這些欄位打包在一起（bit packing），就能直接比較，找出最優先的提案。"] } },
      { d: 3.4, en: "Next comes coordination: resolving conflicts between overlapping proposals. We can simply work through them in order. As shown here, five proposals cannot keep their full range and have to be clipped.", zh: "接下來進入協調階段，消除提案重疊造成的衝突。我們只需要簡單地依序排除衝突就可以了。如圖所示，有五筆提案沒能拿到完整的範圍，必須截短。", tip: { en: ["simply", "The previous step has already sorted the proposals by position and priority."], zh: ["簡單地", "經過剛剛的整理，提案已經按照位置與優先序排好了。"] } },
      { d: 6.8, en: "Zoom in on L3. C’s request overlaps three higher-priority proposals. Those overlaps begin at 15, 17 and 19, so the smallest value, 15, becomes C’s cutoff. B only runs into A’s claim, so its cutoff is 19.", zh: "放大 L3，看看 C 的申請怎麼被截短。它和三筆優先序更高的提案重疊，重疊的起點分別是 15、17、19。取最小值 15，C 的申請範圍就到這裡為止。B 只碰到 A 已保留的路段（claim），所以截在 19。" },
      { d: 6.0, en: "Then we update each car’s state.", zh: "然後回去更新車輛狀態。", tip: { en: ["update each car’s state", "Each clipped proposal uses atomicMin to update its car’s result. With the ring index packed into the high bits, the nearest cutoff is the one that remains. If nothing is clipped, the result stays at 0xFFFFFFFF: every request was approved."], zh: ["更新車輛狀態", "每筆被截短的提案，都會用 atomicMin 更新所屬車輛的結果。ring 索引放在高位元，因此最後留下的是離車最近的截止位置。如果所有申請都通過，結果就維持初始值 0xFFFFFFFF，表示全部核准。"] } },
      { d: 5.0, en: "Each car keeps only the space it needs, leaving the rest free for other cars to change lanes.", zh: "車子只保留必要的空間，把其餘的讓出來，方便其他車變換車道。" },
      { d: 4.4, en: "Now each car moves forward, never beyond the space it holds. That’s one tick—1/15 of a second of simulation time. The cars formed a queue using nothing but priorities.", zh: "最後，車子往前開，但不會超出自己保留的路段。一個 tick 就這樣完成了，模擬往前推進 1/15 秒。不用觀察其他車，光靠優先序，三台車就排好了隊。" },
    ]);
    const B = (i, f = 0) => tl.at(i, f);
    const BEAT = { intro: 0, claim: 1, ext: 2, cut: 3, sort: 4, coord: 5, zoom: 6, result: 7, integrate: 8, move: 9 };

    // ── 幾何 ──
    const X = (m) => 40 + 20 * m;          // 30 m 的路畫在 40..640
    const ROAD_Y = 40, ROAD_H = 44, ROAD_C = ROAD_Y + ROAD_H / 2;
    const ROW = { A: 98, B: 112, C: 126 }; // 每台車一列出價
    const BAR_H = 10;
    const CAR_LEN = 4.5 * 20, CAR_W = 34; // 4.5 × 1.8 m 左右
    const color = { A: C.a, B: C.b, C: C.c };
    const hatch = { A: TA.hatch(svg, "req-ha", C.a), B: TA.hatch(svg, "req-hb", C.b), C: TA.hatch(svg, "req-hc", C.c) };
    const prio = (pri) => String(pri); // 圖上一律十進位，讀者不必會 hex

    // 三台車：tail、claim 終點、extension 終點、核准、cap 之後、這一 tick 開多遠
    const cars = {
      A: { tail: 19, claim: 26, ext: 30, approved: 30, capped: 27.58, adv: 1.6 },
      B: { tail: 10, claim: 17, ext: 30, approved: 19, capped: 17.38, adv: 1.2 },
      C: { tail: 1, claim: 8, ext: 20, approved: 10, capped: 8.38, adv: 0.8 },
    };
    const stagger = { A: 0, B: 0.3, C: 0.6 };

    // proposal：依 micro-lane 切好的出價，陣列順序就是 GPU 寫進 buffer 的順序
    const P = [
      ["A", 3, 19, 20, 255], ["C", 0, 1, 5, 255], ["B", 2, 10, 15, 255], ["A", 4, 20, 25, 255],
      ["C", 1, 5, 8, 255], ["B", 3, 15, 17, 255], ["A", 5, 25, 26, 255], ["C", 1, 8, 10, 0x3e],
      ["B", 3, 17, 20, 0x3e], ["A", 5, 26, 30, 0x3e], ["C", 2, 10, 15, 0x3d], ["B", 4, 20, 25, 0x3d],
      ["C", 3, 15, 20, 0x3c], ["B", 5, 25, 30, 0x3c],
    ].map(([car, lane, s, e, pri], raw) => ({ car, lane, s, e, pri, raw }));
    // 輸家與它用 atomicMin 寫進結果的值：(ring << 16) | 該 lane 上的核准終點
    const LOSS = {
      10: "r2 · 10 m", // C 在 L2 輸給 B 的 claim
      12: "r3 · 15 m", // C 在 L3 輸給 B 的 claim
      8: "r1 · 19 m",  // B 在 L3 輸給 A 的 claim（L3 的 80 %）
      11: "r2 · 20 m", // B 在 L4
      13: "r3 · 25 m", // B 在 L5
    };

    // 每條 lane 一欄，欄內依寫入順序往下排
    const COL_Y = 158, CHIP_H = 20, CHIP_P = 24;
    const counts = [0, 0, 0, 0, 0, 0];
    for (const p of P) p.k = counts[p.lane]++;
    const colX = (l) => X(l * 5) + 8;
    const COL_W = 84;
    const slotY = (k) => COL_Y + k * CHIP_P;

    // ── 底圖：路、micro-lane 刻度 ──
    const gRoad = el("g", {}, svg);
    el("rect", { x: X(0), y: ROAD_Y, width: X(30) - X(0), height: ROAD_H, fill: C.road }, gRoad);
    for (let i = 0; i <= 6; i++) {
      el("line", { x1: X(i * 5), y1: ROAD_Y - 6, x2: X(i * 5), y2: ROW.C + BAR_H + 6, stroke: C.dash, "stroke-width": 1, "stroke-dasharray": i % 6 ? "3 3" : "none" }, gRoad);
      if (i < 6) text(gRoad, { x: X(i * 5 + 2.5), y: ROAD_Y - 12, text: `L${i}`, "text-anchor": "middle", fill: C.soft, "font-size": 11.5 });
    }
    text(gRoad, { x: X(30) + 8, y: ROAD_C, text: "→", fill: C.soft, "font-size": 14 });
    for (const k of ["A", "B", "C"]) text(gRoad, { x: 30, y: ROW[k] + BAR_H / 2, text: k, "text-anchor": "end", fill: color[k], "font-weight": 600, "font-size": 11.5 });
    const gIntro = el("g", {}, svg);
    text(gIntro, { x: X(0), y: ROW.C + BAR_H + 18, text: "1 micro-lane = 5 m", fill: C.soft, "font-size": 11.5 });

    // ── 每條 lane 的那一欄（記憶體裡的一塊，一個執行緒只讀自己那一欄）──
    const gCols = el("g", {}, svg);
    const cols = [];
    for (let l = 0; l < 6; l++) {
      const h = counts[l] * CHIP_P + 6;
      cols.push({
        bg: el("rect", { x: colX(l) - 4, y: COL_Y - 5, width: COL_W + 8, height: h, fill: C.col, rx: 2 }, gCols),
        wg: el("rect", { x: colX(l) - 4, y: COL_Y - 5, width: COL_W + 8, height: h, fill: "none", stroke: C.teal, "stroke-width": 1.5, rx: 2, opacity: 0 }, gCols),
      });
    }

    // ── 每台車：claim（實心，state）、extension（斜線，出價）、核准標記、還回去的虛線 ──
    const gBars = el("g", {}, svg);
    const bars = {};
    for (const k of ["A", "B", "C"]) {
      bars[k] = {
        plan: el("rect", { y: ROW[k], height: BAR_H, fill: "none", stroke: color[k], "stroke-width": 1.2, "stroke-dasharray": "3 2" }, gBars),
        grant: el("rect", { y: ROW[k], height: BAR_H, fill: C.teal, opacity: 0 }, gBars),
        // 和 extension 一樣描 1px 邊，兩段才一樣粗
        // claim 整條都是 255：車身加上車頭前方的安全冗餘，同一個優先值，所以同一種畫法
        claim: el("rect", { y: ROW[k], height: BAR_H, fill: color[k], stroke: color[k], "stroke-width": 1 }, gBars),
        ext: el("rect", { y: ROW[k], height: BAR_H, fill: hatch[k], stroke: color[k], "stroke-width": 1 }, gBars),
        claimLbl: text(gBars, { y: ROW[k] + BAR_H / 2 + 0.5, "font-size": 10, fill: C.onSolid, "font-weight": 600, text: "255" }),
        // 核准終點：朝左的三角，頂點貼著終點、高度不超出這一列
        tick: el("path", { d: `M0,0 l7,-${BAR_H / 2} v${BAR_H} z`, fill: C.teal }, gBars),
      };
    }
    // 輸家被截掉的那一段，同步塗在上面的出價條上（同一台車輸幾格就疊幾段）
    const CUT_AT = { 10: 10, 12: 15, 8: 19, 11: 20, 13: 25 };
    const lostBars = Object.entries(CUT_AT).map(([idx, at]) => {
      const p = P[+idx];
      return el("rect", { x: X(at), y: ROW[p.car], width: X(p.e) - X(at), height: BAR_H, fill: C.lost, stroke: C.red, "stroke-width": 1, opacity: 0 }, gBars);
    });
    // extension 的衰減優先值
    const gDecay = el("g", {}, svg);
    const decayLbl = P.filter((p) => p.pri !== 255).map((p) => text(gDecay, { x: X((p.s + p.e) / 2), y: ROW[p.car] + BAR_H / 2 + 0.5, "text-anchor": "middle", "font-size": 10, fill: color[p.car], "font-weight": 600, "paint-order": "stroke", stroke: C.sheet, "stroke-width": 3, text: prio(p.pri) }));

    // 路面上的安全冗餘：車頭到 claim 終點，淡色加虛線框，畫在車子底下
    const gBuffer = el("g", {}, svg);
    const buffer = {};
    for (const k of ["A", "B", "C"]) buffer[k] = el("rect", { y: ROAD_C - CAR_W / 2 + 3, height: CAR_W - 6, // 比車身窄一點，起點才藏得進車底
       rx: 3, fill: color[k], "fill-opacity": 0.16, stroke: color[k], "stroke-width": 1.2, "stroke-dasharray": "4 3" }, gBuffer);

    const gCars = el("g", {}, svg);
    const carG = {};
    for (const k of ["A", "B", "C"]) carG[k] = TA.car(gCars, { len: CAR_LEN, wid: CAR_W, color: color[k], label: k });

    // ── proposal 晶片：從路上那一段落到自己 lane 的欄裡 ──
    const gChips = el("g", {}, svg);
    for (const p of P) {
      const g = el("g", {}, gChips);
      p.g = g;
      p.box = el("rect", { rx: 2, "stroke-width": 1.2 }, g);
      p.label = text(g, { "text-anchor": "middle", "font-size": 11.5, "font-weight": 600, text: `${p.car} · ${prio(p.pri)}` });
      p.slash = el("line", { stroke: C.red, "stroke-width": 1.6, opacity: 0 }, g);
      const solid = p.pri === 255;
      set(p.box, { fill: solid ? color[p.car] : C.sheet, stroke: color[p.car] });
      set(p.label, { fill: solid ? C.onSolid : color[p.car] });
      // 切開：在路上原地浮起、彼此留一道縫；分組：落到自己 lane 的欄
      p.born = B(BEAT.cut, 0.6 + p.lane * 0.12);
      const t0 = B(BEAT.sort, 0.2 + p.raw * 0.13);
      p.dropAt = t0;
      p.track = track([
        [p.born, { x: X(p.s), y: ROW[p.car], w: X(p.e) - X(p.s), h: BAR_H }],
        [p.born + 0.6, { x: X(p.s) + 3, y: ROW[p.car], w: X(p.e) - X(p.s) - 6, h: BAR_H }],
        [t0, { x: X(p.s) + 3, y: ROW[p.car], w: X(p.e) - X(p.s) - 6, h: BAR_H }],
        [t0 + 1.0, { x: colX(p.lane), y: slotY(p.k), w: COL_W, h: CHIP_H }],
      ]);
    }
    // 切開：製圖的剖切線——一點鏈線（長劃、點），從 lane 標籤底下一路切過路面、車子與出價列。
    // 深淺兩條疊在一起：底下一條稍寬的襯線，上面一點鏈線，壓在車上、路上、紙上都看得到。
    // Bright 是白襯黑線，Dim 對調成深襯淺線（--anim-cut-light / --anim-cut-dark，見 css/devlog/09-anim.css）。
    const gCut = el("g", {}, svg);
    const CUT_TOP = ROAD_Y - 6, CUT_BOT = ROW.C + BAR_H + 5;
    const cutMarks = [1, 2, 3, 4, 5].map((i) => {
      const g = el("g", { opacity: 0 }, gCut);
      const under = el("line", { x1: X(i * 5), x2: X(i * 5), y1: CUT_TOP, y2: CUT_BOT, stroke: "var(--anim-cut-light)", "stroke-width": 3.2 }, g);
      const over = el("line", { x1: X(i * 5), x2: X(i * 5), y1: CUT_TOP, y2: CUT_BOT, stroke: "var(--anim-cut-dark)", "stroke-width": 1.2, "stroke-dasharray": "9 3 2 3" }, g);
      return { g, under, over };
    });

    // ── L3 放大（在欄的下方）──
    const gZoom = el("g", {}, svg);
    const ZX = (m) => 96 + (m - 15) * 46; // L3 = 15..20 m → 96..326
    // 桶裡的順序（scatter 寫入的順序），不排序：A claim、B claim、B ext、C ext
    const zRows = [P[0], P[5], P[8], P[12]];
    const ZY = (i) => 304 + i * 20;
    el("line", { x1: ZX(15), y1: ZY(4) - 2, x2: ZX(20), y2: ZY(4) - 2, stroke: C.soft, "stroke-width": 1 }, gZoom);
    for (let m = 15; m <= 20; m++) {
      el("line", { x1: ZX(m), y1: ZY(4) - 5, x2: ZX(m), y2: ZY(4) + 1, stroke: C.soft, "stroke-width": 1 }, gZoom);
      text(gZoom, { x: ZX(m), y: ZY(4) + 10, text: `${m}`, "text-anchor": "middle", "font-size": 10, fill: C.soft });
    }
    text(gZoom, { x: ZX(20) + 10, y: ZY(4) + 10, text: "m", "font-size": 10, fill: C.soft });
    text(gZoom, { x: 34, y: 288, text: "L3 · one thread per proposal", "font-size": 11.5, fill: C.soft });
    const zr = zRows.map((p, i) => {
      const y = ZY(i);
      const solid = p.pri === 255;
      const g = el("g", {}, gZoom);
      text(g, { x: 34, y: y + 7, text: p.car, fill: color[p.car], "font-weight": 600, "font-size": 12 });
      text(g, { x: 50, y: y + 7, text: prio(p.pri), fill: color[p.car], "font-size": 12 });
      el("rect", { x: ZX(p.s), y, width: ZX(p.e) - ZX(p.s), height: 14, fill: solid ? color[p.car] : hatch[p.car], stroke: color[p.car], "stroke-width": 1 }, g);
      const lost = el("rect", { y, height: 14, fill: C.lost, opacity: 0 }, g);
      const verdict = text(g, { x: ZX(20) + 12, y: y + 7, "font-size": 11.5, opacity: 0 });
      return { lost, verdict };
    });
    // 一個執行緒的視角：每個重疊又贏過我的對手，在 max(start_o, start_me) 截我一刀，我留最小的
    // C 的出價（第 3 列）：B claim → 15、B ext → 17、A claim → 19；B 的出價（第 2 列）：A claim → 19
    const cand = [
      { from: 1, to: 3, at: 15, f: 1.0 },
      { from: 2, to: 3, at: 17, f: 1.6 },
      { from: 0, to: 3, at: 19, f: 2.2 },
      { from: 0, to: 2, at: 19, f: 4.0 },
    ].map((c) => {
      // 記號照設計系統的 TRACE：方塊是起點（贏家的起點），三角是終點（截到輸家的地方）；1px 實線。
      // 截斷是修訂，用朱紅。贏家在上、輸家在下，所以線一律往下畫。
      // 方塊壓在贏家那條 bar 的中線上、三角貼著輸家 bar 的上緣：相鄰兩列也不會撞在同一條縫裡。
      const x = ZX(c.at), yc = ZY(c.from) + 7, y1 = ZY(c.to);
      const g = el("g", { opacity: 0 }, gZoom);
      el("line", { x1: x, x2: x, y1: yc + 3, y2: y1 - 5, stroke: C.red, "stroke-width": 1 }, g);
      el("rect", { x: x - 3, y: yc - 3, width: 6, height: 6, fill: C.sheet, stroke: C.red, "stroke-width": 1 }, g);
      el("path", { d: `M${x - 4},${y1 - 6} h8 l-4,6 z`, fill: C.red }, g);
      return { ...c, g };
    });
    const rules = [
      "o beats me if:",
      "· higher priority",
      "· tie → o is ahead",
      "· exact tie → coin flip",
      "my end = min over them",
    ].map((s, i) => text(gZoom, { x: 482, y: 308 + i * 18, text: s, "font-size": 11.5, opacity: 0 }));
    const ruleBox = el("rect", { x: 470, y: 294, width: 200, height: 102, fill: "none", stroke: C.grid, "stroke-width": 1, opacity: 0 }, gZoom);

    // ── 結果暫存器（同一塊位置）──
    const gReg = el("g", {}, svg);
    const REG_Y = { A: 312, B: 346, C: 380 };
    const reg = {};
    text(gReg, { x: 34, y: 288, text: "CoordinationResult · per car, starts at 0xFFFFFFFF", "font-size": 11.5, fill: C.soft });
    for (const k of ["A", "B", "C"]) {
      const y = REG_Y[k];
      text(gReg, { x: 34, y, text: `result[${k}]`, fill: color[k], "font-weight": 600, "font-size": 12 });
      el("rect", { x: 104, y: y - 12, width: 112, height: 24, fill: C.sheet, stroke: C.ink, "stroke-width": 1 }, gReg);
      reg[k] = {
        hex: text(gReg, { x: 160, y, "text-anchor": "middle", "font-size": 12.5, "font-weight": 600, text: "0xFFFF_FFFF" }),
        decode: text(gReg, { x: 482, y, "font-size": 11.5, opacity: 0 }),
      };
    }
    const perCar = { A: [], B: [], C: [] };
    for (const [idx, short] of Object.entries(LOSS)) {
      const p = P[+idx];
      const g = el("g", {}, gReg);
      const box = el("rect", { width: 70, height: 18, rx: 2, fill: C.sheet, stroke: C.red, "stroke-width": 1.2 }, g);
      const t = text(g, { x: 35, y: 9.5, "text-anchor": "middle", "font-size": 10.5, fill: C.red, text: short });
      perCar[p.car].push({ p, g, box, t });
    }
    // 各車的輸家依 ring 排好，第一個就是 atomicMin 留下的那個
    for (const k of ["B", "C"]) perCar[k].sort((a, b) => a.t.textContent.localeCompare(b.t.textContent));
    const decodeText = { A: "→ all approved (30 m)", B: "→ r1, 80 % of L3 = 19 m", C: "→ r2, start of L2 = 10 m" };
    const finalHex = { A: "0xFFFF_FFFF", B: "0x0001_CCCC", C: "0x0002_0000" };
    const minLbl = {
      B: text(gReg, { x: 271, y: REG_Y.B + 16, "text-anchor": "middle", "font-size": 10, fill: C.teal, text: "min", opacity: 0 }),
      C: text(gReg, { x: 271, y: REG_Y.C + 16, "text-anchor": "middle", "font-size": 10, fill: C.teal, text: "min", opacity: 0 }),
    };

    // ── update ──
    const fade = (t, i0, f0, i1, f1, d = 0.5) => Math.min(tl.p(t, i0, f0, d), 1 - tl.p(t, i1, f1, d));

    const update = (t) => {
      set(gIntro, { opacity: tl.p(t, BEAT.intro, 0, 1.0) * (1 - tl.p(t, BEAT.claim, 0, 0.6)) });

      // 出價、欄、晶片：一路留到 integrate 才收掉
      const bidsOut = tl.p(t, BEAT.integrate, 0, 0.6);
      // 切開時晶片蓋在出價條上，條上的優先值會從縫裡露出半個字：切開這一拍先藏起來，晶片全部落進欄裡再淡回來
      const prioHidden = Math.min(tl.p(t, BEAT.cut, 0, 0.3), 1 - tl.p(t, BEAT.sort, 2.4, 0.5));

      for (const k of ["A", "B", "C"]) {
        const c = cars[k];
        const adv = c.adv * tl.p(t, BEAT.move, 0.3, 2.6);
        TA.place(carG[k], X(c.tail + 4.5 + adv), ROAD_C, 0, tl.p(t, BEAT.intro, 0.2 + stagger[k], 0.8));

        const b = bars[k];
        // claim：先長出來；integrate 時延伸到核准、再被 cap 收回
        const grow = tl.p(t, BEAT.claim, 0.2 + stagger[k], 1.2);
        let end = lerp(c.tail, c.claim, grow);
        end = lerp(end, Math.max(c.claim, c.approved), tl.p(t, BEAT.integrate, 0.4, 1.4));
        end = lerp(end, Math.max(c.claim, c.capped), tl.p(t, BEAT.integrate, 2.4, 1.4));
        const start = c.tail + adv;
        set(b.claim, { x: X(start), width: Math.max(0, X(end) - X(start)), opacity: grow > 0 ? 1 : 0 });
        // 路面上：車頭到 claim 終點這一塊是車子預留的安全空間；起點從車身中段畫起，藏在車底
        const under = start + 2.25;
        // Dim 不畫安全區（--anim-buffer 為 0）：夜裡車燈已經照出前方那一段
        set(buffer[k], { x: X(under), width: Math.max(0, X(end) - X(under)), opacity: end > start + 4.5 ? "var(--anim-buffer)" : 0 });
        // 「255」跟著 claim 長出來時淡入
        set(b.claimLbl, { x: X(start) + 4, opacity: TA.clamp01((grow - 0.4) / 0.6) * (1 - tl.p(t, BEAT.integrate, 0, 0.4)) * (1 - prioHidden) });
        set(b.grant, { x: X(c.claim), width: Math.max(0, X(c.approved) - X(c.claim)), opacity: 0.55 * tl.p(t, BEAT.integrate, 0.4, 1.0) * (1 - tl.p(t, BEAT.integrate, 2.4, 0.8)) });
        set(b.plan, { x: X(c.capped), width: Math.max(0, X(c.approved) - X(c.capped)), opacity: c.approved > c.capped + 0.2 ? tl.p(t, BEAT.integrate, 2.8, 0.8) * (1 - tl.p(t, BEAT.move, 2.6, 1.2)) : 0 });
        const eGrow = tl.p(t, BEAT.ext, 0.2 + stagger[k], 1.3);
        set(b.ext, { x: X(c.claim), width: Math.max(0, (X(c.ext) - X(c.claim)) * eGrow), opacity: eGrow > 0 ? 1 - bidsOut : 0 });
        set(b.tick, { transform: `translate(${X(c.approved) + 1},${ROW[k] + BAR_H / 2})`, opacity: tl.p(t, BEAT.integrate, 0.2, 0.5) * (1 - tl.p(t, BEAT.move, 0, 0.5)) });
      }
      for (const d of decayLbl) set(d, { opacity: tl.p(t, BEAT.ext, 1.4, 0.6) * (1 - bidsOut) * (1 - prioHidden) });
      cutMarks.forEach((m, i) => {
        // 由上往下切下去
        const g = tl.p(t, BEAT.cut, 0.1 + i * 0.08, 0.5);
        const y2 = lerp(CUT_TOP, CUT_BOT, g);
        set(m.under, { y2 });
        set(m.over, { y2 });
        set(m.g, { opacity: g > 0 ? 1 - tl.p(t, BEAT.sort, 0, 0.6) : 0 });
      });

      // 欄：分組時出現；放大 L3 時其他欄淡下去
      const zoomDim = fade(t, BEAT.zoom, 0, BEAT.result, 0, 0.6);
      cols.forEach((c, l) => {
        const o = tl.p(t, BEAT.sort, 0, 0.6) * (1 - bidsOut) * (l === 3 ? 1 : 1 - 0.6 * zoomDim);
        set(c.bg, { opacity: o });
        set(c.wg, { opacity: l === 3 ? zoomDim * (1 - bidsOut) : 0 });
      });

      const pLose = tl.p(t, BEAT.coord, 1.2, 0.8);
      for (const r of lostBars) set(r, { opacity: pLose * (1 - bidsOut) });
      for (const p of P) {
        const s = p.track(t);
        const inCol = TA.clamp01((t - p.dropAt - 0.6) / 0.4);
        const dim = p.lane === 3 ? 1 : 1 - 0.6 * zoomDim;
        set(p.g, { opacity: t >= p.born ? (1 - bidsOut) * dim : 0 });
        set(p.box, { x: s.x, y: s.y, width: s.w, height: s.h });
        set(p.label, { x: s.x + s.w / 2, y: s.y + s.h / 2 + 0.5, opacity: inCol });
        // 還在路上時保留出價的斜線，落進欄裡才換成白底好讀字
        if (p.pri !== 255) set(p.box, { fill: t < p.dropAt + 0.5 ? hatch[p.car] : C.sheet });
        const isLoser = LOSS[p.raw] !== undefined;
        set(p.slash, { x1: s.x + 4, y1: s.y + s.h - 3, x2: s.x + s.w - 4, y2: s.y + 3, opacity: isLoser ? pLose : 0 });
        if (isLoser) set(p.box, { stroke: pLose > 0.5 ? C.red : color[p.car], "stroke-width": pLose > 0.5 ? 1.8 : 1.2 });
      }

      // L3 放大
      set(gZoom, { opacity: zoomDim });
      for (const c of cand) {
        const pc = tl.p(t, BEAT.zoom, c.f, 0.5);
        // C 的三刀在取 min 之後，只留 15 那一刀
        const keep = c.to === 2 || c.at === 15 ? 1 : 1 - 0.7 * tl.p(t, BEAT.zoom, 3.0, 0.5);
        set(c.g, { opacity: pc * keep });
      }
      const pMinC = tl.p(t, BEAT.zoom, 3.0, 0.6);
      const pMinB = tl.p(t, BEAT.zoom, 4.5, 0.6);
      set(zr[3].lost, { x: ZX(15), width: ZX(20) - ZX(15), opacity: pMinC });
      set(zr[3].verdict, { opacity: tl.p(t, BEAT.zoom, 1.0, 0.5), fill: C.red, text: pMinC > 0.5 ? "min → 15 m" : t > B(BEAT.zoom, 2.2) ? "15, 17, 19" : t > B(BEAT.zoom, 1.6) ? "15, 17" : "15" });
      set(zr[2].lost, { x: ZX(19), width: ZX(20) - ZX(19), opacity: pMinB });
      set(zr[2].verdict, { opacity: pMinB, fill: C.red, text: "min → 19 m" });
      set(zr[0].verdict, { opacity: tl.p(t, BEAT.zoom, 5.2, 0.5), fill: C.teal, text: "✓" });
      set(zr[1].verdict, { opacity: tl.p(t, BEAT.zoom, 5.2, 0.5), fill: C.teal, text: "✓" });
      rules.forEach((r, i) => set(r, { opacity: tl.p(t, BEAT.zoom, 0.3 + i * 0.25, 0.5) }));
      set(ruleBox, { opacity: tl.p(t, BEAT.zoom, 0.2, 0.5) });

      // 結果暫存器：輸家從欄裡飛進自己那台車的結果
      set(gReg, { opacity: fade(t, BEAT.result, 0, BEAT.move, 0.6, 0.6) });
      const minAt = B(BEAT.result, 2.6);
      for (const k of ["A", "B", "C"]) {
        perCar[k].forEach((tk, i) => {
          const from = { x: colX(tk.p.lane) + COL_W / 2 - 35, y: slotY(tk.p.k) + 1 };
          const to = { x: 236 + i * 78, y: REG_Y[k] - 9 };
          const pp = tl.p(t, BEAT.result, 0.4 + tk.p.raw * 0.08, 0.9);
          const isMin = i === 0;
          const dim = !isMin ? tl.p(t, BEAT.result, 2.6, 0.6) : 0;
          set(tk.g, { transform: `translate(${lerp(from.x, to.x, pp)},${lerp(from.y, to.y, pp)})`, opacity: pp > 0 ? 1 - 0.65 * dim : 0 });
          const won = isMin && t > minAt;
          set(tk.box, { stroke: won ? C.teal : C.red, "stroke-width": won ? 2 : 1.2 });
          set(tk.t, { fill: won ? C.teal : C.red });
        });
        if (minLbl[k]) set(minLbl[k], { opacity: tl.p(t, BEAT.result, 2.6, 0.5) });
        const showFinal = t > B(BEAT.result, 3.2);
        set(reg[k].hex, { text: showFinal ? finalHex[k] : "0xFFFF_FFFF", fill: showFinal && k !== "A" ? C.red : C.ink });
        set(reg[k].decode, { text: decodeText[k], opacity: tl.p(t, BEAT.result, 3.4 + stagger[k], 0.6), fill: k === "A" ? C.teal : C.ink });
      }
    };

    return { w: W, h: H, tl, update, cars: ["A", "B", "C"] };
  };
})();
