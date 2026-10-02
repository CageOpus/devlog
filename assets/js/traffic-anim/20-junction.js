/* ANIM：路口——轉彎要整段 span 一起拿，拿不到就停在停止線。
   只演概念：span 是 non-trimmable，它在對方 lane 上宣告一段 window；ring 裡是 [d d d B]，
   B（bundle row）展開成 window 每一格一筆 entry。任何一筆輸了，整段 run 不核准（全有或全無）；
   拿到之後以 255 重喊，誰都搶不走；車尾離開 span，window 跟著放掉。
   刻意不演：優先值的實際數字、tier 重疊、行人與兩段 span 的右轉。 */
(() => {
  const TA = window.TrafficAnim;
  const { el, set, text, C, lerp } = TA;
  let clipSeq = 0;

  TA.scenes.junction = (svg) => {
    const W = 680, H = 372;
    const tl = TA.timeline([
      { d: 3.0, en: "A T-junction. S is on the major road, going straight on. L is coming out of the side road and turning across it. Every path through the junction is a lane of its own.", zh: "一個 T 字路口。S 在幹道上直行，L 從支道出來，要橫過幹道左轉。穿過路口的每一條路徑，都是自己的一條 lane。" },
      { d: 3.6, en: "L's turn is one span: it takes the whole turn or none of it. The span also marks a window on S's lane, the bit of road L will cut across.", zh: "L 的轉彎是一個 span：整個彎一起拿，不然就都不拿。span 還在 S 的車道上標出一段 window，就是 L 轉彎時會切過的那一截。" },
      { d: 3.8, en: "So L asks for the turn and the window in one go. In its ring that is one run ending in a bundle row, B, with one entry for each cell of the window.", zh: "所以 L 一次就把彎道和 window 一起要。在它的 ring 裡這是同一段 run，最後一列是 bundle B，window 每一格各一筆 entry。" },
      { d: 3.4, en: "Give way to traffic on the major road. S bids 59 and 58 here, L only 46. The major road ranks higher, so S wins even from further back.", zh: "支道讓幹道。S 在這裡出價 59、58，L 只有 46。幹道的等級比較高，所以 S 就算離得比較遠也會贏。" },
      { d: 4.0, en: "Losing one cell refuses the whole run, so L can never end up stuck across S's lane. It's the yellow box rule: don't go in unless you can get all the way out. L waits at the stop line, and S goes through.", zh: "輸掉一格，整段 run 就不給，所以 L 不會卡在 S 的車道中間。這就是黃色網格線的規矩：出口沒空，就不要進去。L 在停止線等，S 先過。" },
      { d: 3.6, en: "With S gone, the turn is clear and L's bundle wins whole. The span and the window become its claim, at 255, and L pulls out.", zh: "S 走了，彎道空了，L 的 bundle 整段贏下來。span 和 window 都變成它的 claim，優先值 255，L 開出去。" },
      { d: 4.4, en: "S2 turns up while L is still in the middle of its turn. S2's bid runs into the window, but a claim never gives way, so S2 waits. On real roads you'd mostly see this at an all-way stop: under a give-way rule, L holds back until it can go without holding up the major road.", zh: "S2 到的時候，L 還在彎道中間。S2 的出價伸進 window，但 claim 不會讓，S2 只能等。實際上這大多只發生在 all-way stop（每個方向輪流停車再開）的路口：有讓路規則的話，L 會一直等到不會擋到幹道車流才出去。" },
      { d: 4.4, en: "Once L's tail clears the span, the window is handed back and S2 carries on. Nobody looked at anybody: every car only bid for road.", zh: "L 的車尾一離開 span，window 就還回去，S2 繼續往前。誰也沒看誰，每台車都只對道路出價。" },
    ]);
    const B = (i, f = 0) => tl.at(i, f);
    const BEAT = { intro: 0, span: 1, bundle: 2, lose: 3, refuse: 4, win: 5, meet: 6, go: 7 };

    // ── 幾何：橫的是 S 的路（東行在下半），L 從南邊上來左轉進西行 ──
    const LW = 44;
    const RY0 = 96, RY1 = RY0 + 2 * LW, RCY = RY0 + LW; // 橫路 96..184
    const VX0 = 186, VX1 = VX0 + 2 * LW, VCX = VX0 + LW; // 南向支路 186..274
    const EB_Y = RCY + LW / 2;                          // 東行車道中線（S）
    const NB_X = VCX + LW / 2;                          // 北行車道中線（L）
    const MAP_R = 460;                                  // 地圖的右緣，右邊是 ring 面板
    const CAR_LEN = 50, CAR_W = 22, BAND = 10;
    const CELL = 22, WIN = [VX0, VX1];                  // window：S 的 lane 上 4 格 micro-lane
    const winCells = [0, 1, 2, 3].map((i) => [WIN[0] + i * CELL, WIN[0] + (i + 1) * CELL]);

    // L 的路徑，以弧長 s 表示：先往北直走，進路口後四分之一圓左轉，再往西
    const R = NB_X - VX0;
    const ARC0 = H + 30 - RY1, ARC1 = ARC0 + (R * Math.PI) / 2;
    const Lpose = (s) => {
      if (s <= ARC0) return { x: NB_X, y: H + 30 - s, a: -90 };
      if (s <= ARC1) {
        const th = (s - ARC0) / R;
        return { x: VX0 + R * Math.cos(th), y: RY1 - R * Math.sin(th), a: (Math.atan2(-Math.cos(th), -Math.sin(th)) * 180) / Math.PI };
      }
      return { x: VX0 - (s - ARC1), y: RY1 - R, a: 180 };
    };
    const Lpath = (s0, s1) => {
      if (s1 <= s0 + 0.5) return "M0,0";
      const n = Math.max(2, Math.ceil((s1 - s0) / 3));
      let d = "";
      for (let i = 0; i <= n; i++) {
        const p = Lpose(lerp(s0, s1, i / n));
        d += `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      }
      return d;
    };
    const L_WAIT = ARC0 - 6; // 停在停止線前的車頭位置

    const color = { S: C.a, L: C.b, S2: C.c };
    const hatch = { S: TA.hatch(svg, "jn-hs", C.a), L: TA.hatch(svg, "jn-hl", C.b), S2: TA.hatch(svg, "jn-hs2", C.c) };

    // 地圖裁在 MAP_R 以內，開出去的車不會壓到面板
    const clipId = `jn-clip-${++clipSeq}`;
    const defs = svg.querySelector("defs") || el("defs", {}, svg);
    el("rect", { x: 0, y: 0, width: MAP_R, height: H }, el("clipPath", { id: clipId }, defs));
    const gMap = el("g", { "clip-path": `url(#${clipId})` }, svg);

    // ── 底圖 ──
    el("rect", { x: 0, y: RY0, width: MAP_R, height: RY1 - RY0, fill: C.road }, gMap);
    el("rect", { x: VX0, y: RY1 - 1, width: VX1 - VX0, height: H - RY1 + 1, fill: C.road }, gMap);
    for (const [x1, x2] of [[0, VX0], [VX1, MAP_R]]) el("line", { x1, x2, y1: RCY, y2: RCY, stroke: C.dash, "stroke-width": 1, "stroke-dasharray": "8 6" }, gMap);
    el("line", { x1: VCX, x2: VCX, y1: RY1 + 4, y2: H, stroke: C.dash, "stroke-width": 1, "stroke-dasharray": "8 6" }, gMap);
    // 停止線
    el("line", { x1: VCX + 2, x2: VX1 - 2, y1: RY1 + 3, y2: RY1 + 3, stroke: C.soft, "stroke-width": 2.5 }, gMap);
    const stopLbl = text(gMap, { x: VX1 + 8, y: RY1 + 4, text: "stop line", "font-size": 11, fill: C.soft, opacity: 0 });

    // 兩條路徑的導引線：畫在出價條上面、車子底下（gCars 建立前才 append），Dim 時往白提亮
    const gGuides = el("g", {});
    const guide = (c) => `color-mix(in srgb, ${c}, #fff var(--anim-guide-lift))`;
    // 行進路線：虛線，尾端一個箭頭
    const arrow = (x, y, a, fill) => el("path", { d: "M0,0 l-9,-5 v10 z", fill, transform: `translate(${x},${y}) rotate(${a})` }, gGuides);
    el("line", { x1: 0, x2: MAP_R - 24, y1: EB_Y, y2: EB_Y, stroke: guide(color.S), "stroke-width": 1.4, "stroke-dasharray": "7 5" }, gGuides);
    arrow(MAP_R - 16, EB_Y, 0, guide(color.S));
    const lEnd = Lpose(ARC1 + VX0 - 24);
    el("path", { d: Lpath(0, ARC1 + VX0 - 32), fill: "none", stroke: guide(color.L), "stroke-width": 1.4, "stroke-dasharray": "7 5" }, gGuides);
    arrow(lEnd.x, lEnd.y, lEnd.a, guide(color.L));

    // ── span 與 window ──
    const spanHalo = el("path", { d: Lpath(ARC0, ARC1), fill: "none", stroke: color.L, "stroke-width": 26, "stroke-opacity": 0.16, opacity: 0 }, gMap);
    const spanLbl = text(gMap, { x: 262, y: RY0 - 14, text: "span", "font-size": 11.5, fill: color.L, "font-weight": 600, opacity: 0 });
    const winBox = el("rect", { x: WIN[0], y: RCY + 3, width: WIN[1] - WIN[0], height: LW - 6, fill: "none", stroke: color.L, "stroke-width": 1.2, "stroke-dasharray": "4 3", opacity: 0 }, gMap);
    const winLbl = text(gMap, { x: WIN[0] - 8, y: RY1 + 16, text: "window on S's lane", "text-anchor": "end", "font-size": 11.5, fill: color.L, "font-weight": 600, opacity: 0 });

    // ring 與畫面的對應：d0–d2 是彎道（span）上的三段，B 的每筆 entry 是 window 的一格。
    // 對應的兩邊同時亮一圈青色光暈：bundle 那拍依序點一次，之後滑鼠停在任一邊也會亮（見 applyHL）。
    // 光暈畫在出價底下，只從邊緣透出來，不蓋住出價本身。
    const SEG = (ARC1 - ARC0) / 3;
    const segOf = (i) => [ARC0 + i * SEG, ARC0 + (i + 1) * SEG];
    const gHL = el("g", {}, gMap);
    const segHL = [0, 1, 2].map((i) => el("path", { d: Lpath(...segOf(i)), fill: "none", stroke: C.teal, "stroke-width": BAND + 12, "stroke-opacity": 0.55, opacity: 0 }, gHL));
    const cellHL = winCells.map(([x0, x1]) => el("rect", { x: x0 - 3, y: RCY - 2, width: x1 - x0 + 6, height: LW + 4, rx: 3, fill: C.teal, "fill-opacity": 0.6, opacity: 0 }, gHL));

    // L 的出價：window 的四格（在 S 的 lane 上）、span（沿著彎道）、停止線前的 claim
    const gWin = el("g", {}, gMap);
    const cells = winCells.map(([x0, x1]) => ({
      bid: el("rect", { x: x0 + 1, y: RCY + 5, width: x1 - x0 - 2, height: LW - 10, fill: hatch.L, stroke: color.L, "stroke-width": 1 }, gWin),
      lost: el("rect", { x: x0 + 1, y: RCY + 5, width: x1 - x0 - 2, height: LW - 10, fill: C.lost, stroke: C.red, "stroke-width": 1.4, opacity: 0 }, gWin),
    }));
    // 出價的數字：L 的 bundle entry 都是同一個優先值；S 的 extension 逐格衰減，但幹道的等級高，還是贏
    const winPri = [0, 1].map((i) => text(gWin, { x: winCells[i][0] + CELL / 2, y: RCY + 11, text: "46", "text-anchor": "middle", "font-size": 10, "font-weight": 600, fill: color.L, "paint-order": "stroke", stroke: C.sheet, "stroke-width": 3, opacity: 0 }));
    const winHeld = text(gWin, { x: (WIN[0] + WIN[1]) / 2, y: EB_Y + 13, text: "255", "text-anchor": "middle", "font-size": 10, "font-weight": 600, fill: C.onSolid, opacity: 0 });

    const gL = el("g", {}, gMap);
    const lClaim = el("path", { fill: "none", stroke: color.L, "stroke-width": BAND }, gL);
    const lSpan = el("path", { d: Lpath(ARC0, ARC1), fill: "none", stroke: hatch.L, "stroke-width": BAND }, gL);
    const lSpanLost = el("path", { d: Lpath(ARC0, ARC1), fill: "none", stroke: C.lost, "stroke-width": BAND, opacity: 0 }, gL);
    // span 切成 d0–d2 三段：段與段之間一道紙色的縫，外側印段名
    const gSeg = el("g", {}, gL);
    for (const i of [1, 2]) {
      const q = Lpose(ARC0 + i * SEG), a = (q.a * Math.PI) / 180, nx = -Math.sin(a), ny = Math.cos(a), h = BAND / 2 + 1;
      el("line", { x1: q.x - nx * h, y1: q.y - ny * h, x2: q.x + nx * h, y2: q.y + ny * h, stroke: C.sheet, "stroke-width": 2 }, gSeg);
    }
    for (const i of [0, 1, 2]) {
      const th = (i + 0.5) * SEG / R, x = VX0 + (R + 15) * Math.cos(th), y = RY1 - (R + 15) * Math.sin(th);
      text(gSeg, { x, y: y + 0.5, text: `d${i}`, "text-anchor": "middle", "font-size": 10, "font-weight": 600, fill: color.L, "paint-order": "stroke", stroke: C.road, "stroke-width": 3 });
    }
    const midArc = Lpose(ARC0 + (R * Math.PI) / 4);
    const spanHeld = text(gL, { x: midArc.x, y: midArc.y + 0.5, text: "255", "text-anchor": "middle", "font-size": 10, "font-weight": 600, fill: C.onSolid, opacity: 0 });

    // S 與 S2 的出價：東行車道上的 claim 與 extension
    // （S2 的 extension 會輸給 L 已握著的 window，輸掉那段塗紅；S 第一次是贏家，不用）
    const lane = (k) => ({
      claim: el("rect", { y: EB_Y - BAND / 2, height: BAND, fill: color[k], stroke: color[k], "stroke-width": 1 }, gMap),
      ext: el("rect", { y: EB_Y - BAND / 2, height: BAND, fill: hatch[k], stroke: color[k], "stroke-width": 1 }, gMap),
      // 核准：跟 ANIM 1 一樣，給出去的路塗青
      grant: el("rect", { y: EB_Y - BAND / 2, height: BAND, fill: C.teal, opacity: 0 }, gMap),
      lost: el("rect", { x: WIN[0], y: EB_Y - BAND / 2, height: BAND, fill: C.lost, stroke: C.red, "stroke-width": 1, opacity: 0 }, gMap),
    });
    const bS = lane("S"), bS2 = lane("S2");
    // S 的出價數字疊在它自己的出價條上面
    const sPri = ["59", "58"].map((v, i) => text(gMap, { x: winCells[i][0] + CELL / 2, y: EB_Y + 0.5, text: v, "text-anchor": "middle", "font-size": 10, "font-weight": 600, fill: color.S, "paint-order": "stroke", stroke: C.sheet, "stroke-width": 3, opacity: 0 }));

    gMap.appendChild(gGuides);

    // ── 車 ──
    const gCars = el("g", {}, gMap);
    const carS = TA.car(gCars, { len: CAR_LEN, wid: CAR_W, color: color.S, label: "S" });
    const carS2 = TA.car(gCars, { len: CAR_LEN, wid: CAR_W, color: color.S2, label: "S2" });
    const carL = TA.car(gCars, { len: CAR_LEN, wid: CAR_W, color: color.L, label: "L" });

    // ── 右側：L 的 ring 與結果 ──
    const gPanel = el("g", {}, svg);
    const PX = 490;
    el("line", { x1: MAP_R + 14, x2: MAP_R + 14, y1: 30, y2: H - 30, stroke: C.grid, "stroke-width": 1 }, gPanel);
    const gRing = el("g", {}, gPanel);
    text(gRing, { x: PX, y: 44, text: "L's ring", "font-size": 11.5, fill: C.soft });
    const RW = 36, RG = 8, RY = 56, RH = 24; // 格距要大於兩圈光暈的寬，相鄰兩格同時亮才不會疊在一起
    // d 是實線框（像彎道上的那條出價），B 和它的 entry 是虛線框（像 S 車道上的 window 框）
    const ring = ["d0", "d1", "d2", "B"].map((s, i) => {
      const x = PX + i * (RW + RG);
      const box = el("rect", { x, y: RY, width: RW, height: RH, rx: 2, fill: C.sheet, stroke: color.L, "stroke-width": 1.2, "stroke-dasharray": i === 3 ? "4 2" : "none" }, gRing);
      const lbl = text(gRing, { x: x + RW / 2, y: RY + RH / 2 + 0.5, text: s, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: color.L, "pointer-events": "none" });
      return { box, lbl, x };
    });
    const ringNoteD = text(gRing, { x: PX, y: RY + RH + 14, text: "d: the turn itself", "font-size": 10.5, fill: C.soft });
    const bundleNote = text(gRing, { x: PX, y: 142, text: "B: one entry per window cell", "font-size": 10.5, fill: C.soft });
    const CW = 36;
    const chips = winCells.map((_, i) => {
      const x = PX + i * (CW + RG);
      const g = el("g", {}, gRing);
      const box = el("rect", { x, y: 110, width: CW, height: 18, rx: 2, fill: hatch.L, stroke: color.L, "stroke-width": 1.2, "stroke-dasharray": "4 2" }, g);
      const slash = el("line", { x1: x + 4, y1: 125, x2: x + CW - 4, y2: 113, stroke: C.red, "stroke-width": 1.6, opacity: 0, "pointer-events": "none" }, g);
      return { g, box, slash };
    });
    // B 與它的四筆 entry 之間的括號
    const bx = ring[3].x + RW / 2;
    const brace = el("path", { d: `M${bx},${RY + RH + 2} V102 M${PX + 2},106 V102 H${PX + 4 * CW + 3 * RG - 2} V106`, fill: "none", stroke: C.soft, "stroke-width": 1 }, gRing);
    text(gRing, { x: PX, y: 170, text: "result[L]", "font-size": 11.5, fill: C.soft });
    const resBox = el("rect", { x: PX, y: 180, width: 4 * CW + 3 * RG, height: 24, fill: C.sheet, stroke: C.ink, "stroke-width": 1 }, gRing);
    const resTxt = text(gRing, { x: PX + (4 * CW + 3 * RG) / 2, y: 192.5, "text-anchor": "middle", "font-size": 11.5, "font-weight": 600, text: "" });

    // 面板這一側的光暈：ring 格與 entry 外面一圈青框
    const ringHL = ring.map((r) => el("rect", { x: r.x - 2.5, y: RY - 2.5, width: RW + 5, height: RH + 5, rx: 3, fill: "none", stroke: C.teal, "stroke-width": 1.5, opacity: 0, "pointer-events": "none" }, gRing));
    const chipHL = chips.map((_, i) => el("rect", { x: PX + i * (CW + RG) - 2.5, y: 107.5, width: CW + 5, height: 23, rx: 3, fill: "none", stroke: C.teal, "stroke-width": 1.5, opacity: 0, "pointer-events": "none" }, gRing));

    // 哪一個鍵對應哪些東西
    const PAIR = { d0: { seg: [0], ring: [0] }, d1: { seg: [1], ring: [1] }, d2: { seg: [2], ring: [2] }, B: { cell: [0, 1, 2, 3], chip: [0, 1, 2, 3], ring: [3] } };
    winCells.forEach((_, i) => { PAIR[`w${i}`] = { cell: [i], chip: [i], ring: [3] }; });
    const PULSE = [["d0", 2.4], ["d1", 3.0], ["d2", 3.6], ["B", 4.2]];
    let hover = null, lastT = 0;
    const applyHL = () => {
      const lv = { seg: [0, 0, 0], cell: [0, 0, 0, 0], ring: [0, 0, 0, 0], chip: [0, 0, 0, 0] };
      const add = (key, v) => { const m = PAIR[key]; for (const k in m) for (const i of m[k]) lv[k][i] = Math.max(lv[k][i], v); };
      for (const [k, f] of PULSE) {
        const u = (lastT - B(BEAT.bundle, f)) / 0.9;
        if (u > 0 && u < 1) add(k, Math.sin(Math.PI * u));
      }
      // ring 還在面板上時才對應得起來
      if (hover && lastT >= B(BEAT.bundle, 1.2) && lastT < tRel) add(hover, 1);
      segHL.forEach((e, i) => set(e, { opacity: lv.seg[i] }));
      cellHL.forEach((e, i) => set(e, { opacity: lv.cell[i] }));
      ringHL.forEach((e, i) => set(e, { opacity: lv.ring[i] }));
      chipHL.forEach((e, i) => set(e, { opacity: lv.chip[i] }));
    };
    const hoverable = (node, key) => {
      node.addEventListener("pointerenter", () => { hover = key; applyHL(); });
      node.addEventListener("pointerleave", () => { if (hover === key) { hover = null; applyHL(); } });
    };
    ring.forEach((r, i) => hoverable(r.box, i === 3 ? "B" : `d${i}`));
    chips.forEach((c, i) => hoverable(c.box, `w${i}`));
    // 地圖這一側：看不見的感應區，蓋在最上面
    const gHit = el("g", {}, gMap);
    [0, 1, 2].forEach((i) => hoverable(el("path", { d: Lpath(...segOf(i)), fill: "none", stroke: "transparent", "stroke-width": 24, "pointer-events": "stroke" }, gHit), `d${i}`));
    winCells.forEach(([x0, x1], i) => hoverable(el("rect", { x: x0, y: RCY, width: x1 - x0, height: LW, fill: "transparent", "pointer-events": "all" }, gHit), `w${i}`));

    // 一路累積下來的規則
    const rules = [
      "· priority from the lane",
      "· a run: all or nothing",
      "· a claim never yields",
      "· tail out, window freed",
    ].map((s, i) => text(gPanel, { x: PX - 6, y: 250 + i * 22, text: s, "font-size": 11.5, fill: C.ink, opacity: 0 }));

    // L 拿下彎道後起步：第 6 拍開進彎道一半，第 7 拍（S2 到的時候）轉到快出彎，最後一拍開出去
    const MID = ARC0 + 0.45 * (ARC1 - ARC0);
    const lTrack = TA.track([
      [B(BEAT.win, 2.6), { s: L_WAIT }],
      [B(BEAT.win, 5.6), { s: MID }],
      [B(BEAT.meet, 0.6), { s: MID }],
      [B(BEAT.meet, 4.0), { s: ARC1 - 6 }],
      [B(BEAT.go, 0.3), { s: ARC1 - 6 }],
      [B(BEAT.go, 4.8), { s: ARC1 + CAR_LEN + 110 }],
    ]);
    const lNose = (t) => lTrack(t).s;
    // S2 等到 L 的車尾離開 span 才走：先找出那一刻
    let tRel = B(BEAT.go);
    while (tRel < tl.total && lNose(tRel) - CAR_LEN < ARC1) tRel += 0.02;

    const update = (t) => {
      const pIntro = tl.p(t, BEAT.intro, 0, 1.0);
      set(gGuides, { opacity: pIntro * (1 - 0.7 * tl.p(t, BEAT.span, 0, 0.6)) });

      // ── S：等在左邊，L 被拒之後開過路口 ──
      const sNose = lerp(120, 600, tl.p(t, BEAT.refuse, 2.2, 4.0));
      TA.place(carS, sNose, EB_Y, 0, tl.p(t, BEAT.intro, 0.2, 0.8));
      const sOut = tl.p(t, BEAT.refuse, 2.0, 0.5);
      const sC = tl.p(t, BEAT.lose, 0.2, 0.8), sE = tl.p(t, BEAT.lose, 0.8, 1.2);
      set(bS.claim, { x: sNose - CAR_LEN, width: CAR_LEN + 16, opacity: sC * (1 - sOut) });
      set(bS.ext, { x: sNose + 16, width: Math.max(0, (WIN[0] + 2 * CELL - sNose - 16) * sE), opacity: sE > 0 ? 1 - sOut : 0 });
      const pLose = tl.p(t, BEAT.lose, 2.4, 0.6);
      // L 被拒的同時，S 的 extension 整段核准、亮起來，然後開過去
      set(bS.grant, { x: sNose + 16, width: Math.max(0, WIN[0] + 2 * CELL - sNose - 16), opacity: 0.6 * tl.p(t, BEAT.refuse, 0.6, 0.5) * (1 - sOut) });

      // ── L ──
      const noseS = lNose(t), tailS = noseS - CAR_LEN;
      const lp = Lpose(noseS);
      TA.place(carL, lp.x, lp.y, lp.a, tl.p(t, BEAT.intro, 0.5, 0.8));
      // 被拒之後 L 的車燈收小（Dim 才看得到），表示它輸了、在等；再次出價整段核准時才亮回來
      TA.lights(carL, t >= B(BEAT.win) ? tl.p(t, BEAT.win, 1.2, 0.5) : 1 - tl.p(t, BEAT.refuse, 0.2, 0.8));

      // span 與 window 的提示
      const pSpan = tl.p(t, BEAT.span, 0.3, 0.8), pWin = tl.p(t, BEAT.span, 1.4, 0.8);
      const hintOut = tl.p(t, BEAT.go, 0, 0.6);
      set(spanHalo, { opacity: pSpan * (1 - 0.5 * tl.p(t, BEAT.bundle, 0, 0.6)) * (1 - hintOut) });
      set(spanLbl, { opacity: pSpan * (1 - hintOut) });
      set(winBox, { opacity: pWin * (1 - hintOut) });
      set(winLbl, { opacity: pWin * (1 - hintOut) });

      // 出價：第一次（bundle 拍）被拒後收掉；S 過去之後再出一次，整段贏下來變成 claim
      const second = t >= B(BEAT.win);
      const bidOut = tl.p(t, BEAT.refuse, 1.8, 0.8);
      const bidVis = second ? tl.p(t, BEAT.win, 0.3, 0.8) : tl.p(t, BEAT.bundle, 1.4, 1.0) * (1 - bidOut);
      const pRef = tl.p(t, BEAT.refuse, 0.2, 0.6);
      const pApprove = tl.p(t, BEAT.win, 1.2, 0.5);
      const held = t >= B(BEAT.win, 2.0);
      const pHeld = tl.p(t, BEAT.win, 2.0, 0.5);
      // 車尾離開 span，window 跟著放掉
      const rel = TA.clamp01((tailS - ARC1) / 24);

      // 握住之後 claim 就是「車尾到彎道出口」一整條，車尾走過的部分跟著放掉
      set(lClaim, { d: held ? Lpath(tailS, Math.max(ARC1, noseS + 6)) : Lpath(tailS, ARC0), opacity: tl.p(t, BEAT.bundle, 0.6, 0.8) });
      set(lSpan, { stroke: hatch.L, opacity: held ? 0 : bidVis });
      set(lSpanLost, { opacity: second ? 0 : pRef * (1 - bidOut) });
      set(gSeg, { opacity: held ? 0 : bidVis });
      set(spanHeld, { opacity: pHeld * (1 - tl.p(t, BEAT.win, 2.4, 0.4)) });
      cells.forEach((c, i) => {
        set(c.bid, { fill: held ? color.L : hatch.L, stroke: pApprove > 0.5 && !held ? C.teal : color.L, "stroke-width": pApprove > 0.5 && !held ? 2 : 1, opacity: bidVis * (1 - rel) });
        set(c.lost, { opacity: second ? 0 : Math.max(i < 2 ? pLose : 0, pRef) * (1 - bidOut) });
      });
      set(winHeld, { opacity: pHeld * (1 - rel) });
      const pPri = tl.p(t, BEAT.lose, 1.6, 0.6) * (1 - tl.p(t, BEAT.refuse, 1.0, 0.5));
      for (const x of winPri) set(x, { opacity: pPri });
      for (const x of sPri) set(x, { opacity: pPri });

      set(stopLbl, { opacity: Math.min(tl.p(t, BEAT.refuse, 0.8, 0.5), 1 - tl.p(t, BEAT.win, 0, 0.5)) });

      // ── S2：L 拿下 span 之後才到，出價伸進 window 也輸，等 window 放掉才走 ──
      const s2In = tl.p(t, BEAT.meet, 0.2, 2.4);
      const s2Go = TA.ease(TA.clamp01((t - tRel - 0.3) / 4.0));
      const s2Nose = lerp(lerp(-60, 150, s2In), 400, s2Go); // 最後一格兩台車都還在畫面裡
      TA.place(carS2, s2Nose, EB_Y, 0, s2In > 0 ? 1 : 0);
      const s2Out = TA.clamp01((t - tRel) / 0.4);
      const s2E = tl.p(t, BEAT.meet, 2.6, 0.8);
      set(bS2.claim, { x: s2Nose - CAR_LEN, width: CAR_LEN + 16, opacity: s2In > 0.6 ? 1 - s2Out : 0 });
      set(bS2.ext, { x: s2Nose + 16, width: Math.max(0, (WIN[0] + 2 * CELL - s2Nose - 16) * s2E), opacity: s2E > 0 ? 1 - s2Out : 0 });
      set(bS2.lost, { width: 2 * CELL, opacity: tl.p(t, BEAT.meet, 3.6, 0.6) * (1 - s2Out) });

      // ── ring 面板 ──
      const ringOut = TA.clamp01((t - tRel) / 0.8);
      set(gRing, { opacity: tl.p(t, BEAT.bundle, 0, 0.5) * (1 - ringOut) });
      ring.forEach((r, i) => {
        const pr = tl.p(t, BEAT.bundle, 0.2 + i * 0.2, 0.5);
        const isB = i === 3;
        const red = !second && pRef > 0.5;
        const ok = second && pApprove > 0.5;
        set(r.box, { opacity: pr, stroke: red ? C.red : ok ? C.teal : color.L, fill: held ? color.L : red && isB ? C.lost : C.sheet, "stroke-width": ok || (red && isB) ? 2 : 1.2 });
        set(r.lbl, { opacity: pr * (red && !isB ? 0.45 : 1), fill: held ? C.onSolid : red ? C.red : color.L });
      });
      set(ringNoteD, { opacity: tl.p(t, BEAT.bundle, 0.4, 0.5) });
      const pChip = tl.p(t, BEAT.bundle, 1.4, 0.6);
      set(bundleNote, { opacity: pChip });
      set(brace, { opacity: pChip });
      chips.forEach((c, i) => {
        set(c.g, { opacity: pChip });
        const lost = !second && i < 2 && pLose > 0.5;
        set(c.box, { fill: held ? color.L : hatch.L, stroke: lost ? C.red : second && pApprove > 0.5 && !held ? C.teal : color.L });
        set(c.slash, { opacity: second ? 0 : i < 2 ? pLose : 0 });
      });
      let res = "", resFill = C.ink;
      if (second && pApprove > 0.5) { res = "all approved"; resFill = C.teal; }
      else if (!second && t >= B(BEAT.refuse, 0.5)) { res = "B lost → refused"; resFill = C.red; }
      else if (!second && pLose > 0.5) { res = "lost at B"; resFill = C.red; }
      set(resTxt, { text: res, fill: resFill });
      set(resBox, { stroke: res ? resFill : C.ink });

      const ruleAt = [B(BEAT.lose, 2.8), B(BEAT.refuse, 2.6), B(BEAT.meet, 4.4), tRel + 0.2];
      rules.forEach((r, i) => set(r, { opacity: TA.ease(TA.clamp01((t - ruleAt[i]) / 0.6)) }));
      lastT = t;
      applyHL();
    };

    return { w: W, h: H, tl, update };
  };
})();
