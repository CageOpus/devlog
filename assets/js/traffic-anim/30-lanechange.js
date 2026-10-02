/* ANIM：換道——先試探，兩邊在同一個 tick 都核准才動。
   只演概念：換道要的路是「助跑 + 斜切 + 一點空間」；自己車道要整段（[0, need]），目標車道扣掉助跑（[run_up, need]）。
   PROBING 時 ring 的列成對 [fb pb]：fb 的結果進 slot 0，pb（試探）進 slot 1；試探在 TRANSITION 之前不會出 255。
   fb 讓車子照常往前開，試探每個 tick 跟著車子往前、重新問一次，所以切入點不是事先定好的，是第一個夠大的空檔出現的地方。
   兩個 slot 同一個 tick 都核准 → TRANSITION，兩段都以 255 握住；直線助跑、再等速斜切；過去之後 DONE，fallback 不再出。
   刻意不演：MW、速度調整（目標車道間距 = 自己車道的一半）、PROBING 每 8 tick 歇一次。 */
(() => {
  const TA = window.TrafficAnim;
  const { el, set, text, C, lerp } = TA;

  TA.scenes.lanechange = (svg) => {
    const W = 680, H = 372;
    const tl = TA.timeline([
      { d: 3.0, en: "Here are two lanes heading the same way. M wants to move into the left lane, but A, B and C are already crawling along in a queue.", zh: "這裡有兩條同向車道。M 想切到左邊，但 A、B、C 正在那條車道上排隊，慢慢往前挪。" },
      { d: 3.8, en: "First, M works out how much space the move needs: a short straight stretch, the move across, and a little room at the end. It needs the whole stretch in its current lane. In the left lane, it only needs the part from where it starts moving across.", zh: "M 先算好這次換車道需要多少空間：先直走一小段，再切過去，最後留一點餘裕。在原本的車道上，它需要這一整段；左邊車道則從開始切入的位置算起。" },
      { d: 3.8, en: "Mirrors, then signal. M probes for room, requesting road ahead as usual while also asking for the space it needs in the left lane. Each lane returns its own result.", zh: "看後照鏡、打方向燈，試探看看能不能切過去（probe）。M 一邊照常申請前方的路，一邊也向左邊車道申請換道需要的空間。兩條車道會各自回覆結果。", tip: { en: ["Mirrors", "The car behind also requests space ahead. If those requests extend into the space M wants to enter, they are compared with M’s requests by priority. This accounts for traffic behind M without M ever having to inspect another car."], zh: ["看後照鏡", "後車也會向前申請空間。如果這些請求延伸到 M 想切入的地方，就會和 M 的請求一起比較優先序。因此 M 不用直接觀察後車，也能把後方來車考慮進去。"] } },
      { d: 3.6, en: "Probe requests stay below priority 255, so they cannot take space already claimed by another car. A and B still have priority here, so the left lane says no. M’s current lane says yes, and M keeps going.", zh: "試探歸試探，不能搶走別人已經保留的路段，所以這類請求的優先序不會到 255。A、B 還在那裡，左邊車道暫時不讓 M 切入；但原本的車道沒問題，M 就繼續往前開。" },
      { d: 4.4, en: "M keeps moving, and the probe moves with it, asking again every tick. There’s no fixed cut-in point: M takes the first gap big enough for the move. Here, that’s between B and C.", zh: "M 會繼續往前開，試探的範圍也跟著移動，每個 tick 都重新申請一次。切入點不用事先決定：哪裡先出現夠大的空檔，就從哪裡切過去。這裡是在 B 和 C 之間。" },
      { d: 3.8, en: "Both lanes must approve in the same tick before M can start changing lanes. It enters TRANSITION, with the space it needs in both lanes now claimed at priority 255. Until this point, M hasn’t moved sideways at all.", zh: "兩條車道在同一個 tick 都核准，M 才會進入換道狀態（TRANSITION）。兩邊需要的路段都會先保留給它，優先序升到 255。在這之前，M 完全不會往旁邊偏。" },
      { d: 4.0, en: "M drives straight for a short stretch, then moves smoothly into the left lane. All the space it needs is already reserved, so no other car can cut into it halfway through the manoeuvre.", zh: "接著，M 先直走一小段，再平順地切進左邊車道。沿途需要的空間都已經保留好了，其他車不能在它換到一半時插進來。" },
      { d: 4.0, en: "Once M is fully in the new lane, it releases the space in its old lane. The lane change is complete. One tick later, it’s back to driving as usual, just another car in its new lane.", zh: "完全切進新車道後，M 就會釋放原本車道上的空間，這次換道也就完成了。再過一個 tick，它就和新車道上的其他車一樣，照常往前開。", tip: { en: ["The lane change is complete", "The state changes to DONE and the fallback rows are dropped. On the next tick, it returns to NONE."], zh: ["換道也就完成了", "換道完成後，狀態先切到 DONE，移除 fallback 資料列；下一個 tick 再回到 NONE。"] } },
    ]);
    const B = (i, f = 0) => tl.at(i, f);
    const BEAT = { intro: 0, plan: 1, ring: 2, lost: 3, drive: 4, accept: 5, move: 6, done: 7 };

    // ── 幾何：往右開的兩條車道，上面是左車道（目標），下面是 M 原本的車道 ──
    const LW = 44;
    const RY0 = 50, RCY = RY0 + LW, RY1 = RCY + LW; // 路面 50..138
    const TY = RY0 + LW / 2, SY = RCY + LW / 2;     // 兩條車道中線
    const CAR_LEN = 50, CAR_W = 22, BAND = 10;
    // 換道要的路（從 M 的車尾量起）：車身、直線助跑、斜切、最後留的空間
    const RUN = 72, SLIDE = 80, ROOM = 22;
    const NEED = CAR_LEN + RUN + SLIDE + ROOM;
    // M 的出價在 M_START 時的位置；試探期間整組跟著 M 平移（dx）
    const M_START = 120, M_ACC = 275;                // 開始試探、找到空檔的位置（車頭）
    const TAIL0 = M_START - CAR_LEN;
    const cut = [TAIL0, TAIL0 + RUN, ...[1, 2, 3].map((k) => TAIL0 + RUN + (k * (NEED - RUN)) / 3)];
    const SRC = [0, 1, 2, 3].map((i) => [cut[i], cut[i + 1]]); // 第一段只有 fb（助跑那段目標車道不要），後三段 fb、pb 成對
    const DST = [null, SRC[1], SRC[2], SRC[3]];
    const TAIL_ACC = M_ACC - CAR_LEN, END_ACC = TAIL_ACC + NEED;

    // 左車道的車：一列慢車，各自 claim 自己的車身、往前一小段 extension。B 和 C 之間的空檔剛好夠 M 切進去
    const EXT_Q = 40, PAD = 10; // claim 蓋到車頭前 PAD，extension 再往前 EXT_Q
    const Q = [["A", 110], ["B", 230], ["C", 510]];

    const color = { M: C.b, Q: C.a };
    const hatch = { M: TA.hatch(svg, "lc-hm", C.b), Q: TA.hatch(svg, "lc-hq", C.a) };
    const guide = (c) => `color-mix(in srgb, ${c}, #fff var(--anim-guide-lift))`;
    const bandY = (y) => y - BAND / 2;

    // ── 底圖 ──
    const gMap = el("g", {}, svg);
    el("rect", { x: 0, y: RY0, width: W, height: RY1 - RY0, fill: C.road }, gMap);
    el("line", { x1: 0, x2: W, y1: RCY, y2: RCY, stroke: C.dash, "stroke-width": 1, "stroke-dasharray": "8 6" }, gMap);
    text(gMap, { x: W - 8, y: RY0 - 11, text: "left lane (target)", "text-anchor": "end", "font-size": 11, fill: C.soft });
    text(gMap, { x: W - 8, y: RY1 + 12, text: "M's lane", "text-anchor": "end", "font-size": 11, fill: C.soft });

    // 試探輸掉的地方留一道紅刻痕：切入點是一路試出來的
    const gTrail = el("g", {}, gMap);

    // ── 跟著 M 走的那一組（試探期間平移）──
    const gRel = el("g", {}, gMap);
    // 算出來的範圍：先是虛線框，再變成真的出價
    const planSrc = el("rect", { x: TAIL0, y: SY - 9, width: NEED, height: 18, rx: 2, fill: "none", stroke: color.M, "stroke-width": 1.2, "stroke-dasharray": "4 3" }, gRel);
    const planDst = el("rect", { x: TAIL0 + RUN, y: TY - 9, width: NEED - RUN, height: 18, rx: 2, fill: "none", stroke: color.M, "stroke-width": 1.2, "stroke-dasharray": "4 3" }, gRel);
    // 路面下的尺寸：助跑、斜切、空間（從車頭量起）
    const gDim = el("g", {}, gRel);
    const dims = [["run-up", M_START, TAIL0 + RUN + CAR_LEN], ["slide", TAIL0 + RUN + CAR_LEN, TAIL0 + NEED - ROOM], ["room", TAIL0 + NEED - ROOM, TAIL0 + NEED]];
    for (const [name, x0, x1] of dims) {
      const y = RY1 + 12;
      el("path", { d: `M${x0 + 1},${y - 4} V${y + 4} M${x0 + 1},${y} H${x1 - 1} M${x1 - 1},${y - 4} V${y + 4}`, fill: "none", stroke: C.soft, "stroke-width": 1 }, gDim);
      text(gDim, { x: (x0 + x1) / 2, y: y + 13, text: name, "text-anchor": "middle", "font-size": 10.5, fill: C.soft });
    }
    // ring 與畫面的對應光暈（畫在出價底下，從邊緣透出來）
    const srcHL = SRC.map(([x0, x1]) => el("rect", { x: x0 - 2, y: SY - 11, width: x1 - x0 + 4, height: 22, rx: 3, fill: C.teal, "fill-opacity": 0.6, opacity: 0 }, gRel));
    const dstHL = DST.map((r) => r && el("rect", { x: r[0] - 2, y: TY - 11, width: r[1] - r[0] + 4, height: 22, rx: 3, fill: C.teal, "fill-opacity": 0.6, opacity: 0 }, gRel));

    // 左車道那列車的出價：畫在 M 的試探底下，重疊的地方看得到試探輸在哪
    const qBids = Q.map(() => ({
      claim: el("rect", { y: bandY(TY), height: BAND, fill: color.Q, stroke: color.Q, "stroke-width": 1 }, gMap),
      ext: el("rect", { y: bandY(TY), height: BAND, width: EXT_Q, fill: hatch.Q, stroke: color.Q, "stroke-width": 1 }, gMap),
    }));

    // M 平常的出價（換道前、換道後）：claim 實心、extension 斜線
    const mClaim = el("rect", { height: BAND, fill: color.M, stroke: color.M, "stroke-width": 1 }, gMap);
    const mExt = el("rect", { height: BAND, width: EXT_Q, fill: hatch.M, stroke: color.M, "stroke-width": 1 }, gMap);

    // 試探期間的出價：fb 在自己車道（實線框），pb 在左車道（虛線框，只是問問）
    const gProbe = el("g", {}, gRel);
    const fb = SRC.map(([x0, x1]) => el("rect", { x: x0 + 0.5, y: bandY(SY), width: x1 - x0 - 1, height: BAND, fill: hatch.M, stroke: color.M, "stroke-width": 1 }, gProbe));
    const pb = DST.map((r) => r && el("rect", { x: r[0] + 0.5, y: bandY(TY), width: r[1] - r[0] - 1, height: BAND, fill: hatch.M, stroke: color.M, "stroke-width": 1, "stroke-dasharray": "3 2" }, gProbe));
    // 輸掉的部分（絕對座標，每台左車道的車一塊）
    const pbLost = Q.map(() => el("rect", { y: bandY(TY), height: BAND, fill: C.lost, stroke: C.red, "stroke-width": 1.2, opacity: 0 }, gMap));

    // 切入點：目標車道那段的起點，跟著 M 走；找到空檔時轉青、定住
    const gCut = el("g", {}, gMap);
    const cutLine = el("line", { y1: RY0 - 4, y2: RCY, stroke: color.M, "stroke-width": 1.4, "stroke-dasharray": "3 2" }, gCut);
    const cutLbl = text(gCut, { y: RY0 - 11, text: "cut-in point?", "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: color.M });

    // 握住之後：兩段 claim，255
    const gHeld = el("g", {}, gMap);
    const heldSrc = el("rect", { y: bandY(SY), height: BAND, fill: color.M }, gHeld);
    el("rect", { x: TAIL_ACC + RUN, y: bandY(TY), width: NEED - RUN, height: BAND, fill: color.M }, gHeld);
    const heldTxt = [SY, TY].map((y) => text(gHeld, { x: END_ACC - 22, y: y + 0.5, text: "255", "text-anchor": "middle", "font-size": 10, "font-weight": 600, fill: C.onSolid }));

    // M 換道的路線：直線助跑，再斜切（畫在 M_START，跟著 gRel 平移）
    const SLIDE_A = (Math.atan2(TY - SY, SLIDE) * 180) / Math.PI;
    const gGuide = el("g", {}, gRel);
    const xr = M_START + RUN, xs = xr + SLIDE;
    el("path", { d: `M${M_START + 4},${SY} H${xr} L${xs},${TY} H${xs + 50}`, fill: "none", stroke: guide(color.M), "stroke-width": 1.4, "stroke-dasharray": "7 5" }, gGuide);
    el("path", { d: "M0,0 l-9,-5 v10 z", fill: guide(color.M), transform: `translate(${xs + 58},${TY})` }, gGuide);
    // gRel 裡的出價要壓在左車道那列車的出價上面
    gMap.appendChild(gRel);
    for (const r of pbLost) gMap.appendChild(r);
    gMap.appendChild(gCut);
    gMap.appendChild(gHeld);

    // ── 車 ──
    const gCars = el("g", {}, gMap);
    const carQ = Q.map(([k]) => TA.car(gCars, { len: CAR_LEN, wid: CAR_W, color: color.Q, label: k }));
    const carM = TA.car(gCars, { len: CAR_LEN, wid: CAR_W, color: color.M, label: "M" });
    // 方向燈：左側前後各一盞（往右開，左邊是 -y），Dim 時帶一點光暈
    const blinker = el("g", { opacity: 0 }, carM);
    const bloom = TA.bloomFilter(svg);
    for (const x of [-4, -CAR_LEN + 4]) {
      el("circle", { cx: x, cy: -CAR_W / 2, r: 4, fill: C.indicator, filter: bloom, opacity: "var(--anim-bloom)" }, blinker);
      el("rect", { x: x - 3, y: -CAR_W / 2 - 1.5, width: 6, height: 3, rx: 1.2, fill: C.indicator }, blinker);
    }

    // ── 下方面板：M 的 ring、結果、狀態 ──
    const gPanel = el("g", {}, svg);
    el("line", { x1: 16, x2: W - 16, y1: 172, y2: 172, stroke: C.grid, "stroke-width": 1 }, gPanel);
    const gRing = el("g", {}, gPanel);
    const PX = 24, RY = 196, CW = 34, CH = 24;
    text(gRing, { x: PX, y: 186, text: "M's ring", "font-size": 11.5, fill: C.soft });
    // 排法：fb | fb pb | fb pb | fb pb
    const cellX = { fb: [PX], pb: [null] };
    for (let i = 1; i <= 3; i++) {
      const x = PX + CW + 10 + (i - 1) * (2 * CW + 4 + 10);
      cellX.fb.push(x);
      cellX.pb.push(x + CW + 4);
    }
    const mkCell = (x, s, dashed) => ({
      box: el("rect", { x, y: RY, width: CW, height: CH, rx: 2, fill: C.sheet, stroke: color.M, "stroke-width": 1.2, "stroke-dasharray": dashed ? "4 2" : "none" }, gRing),
      lbl: text(gRing, { x: x + CW / 2, y: RY + CH / 2 + 0.5, text: s, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: color.M, "pointer-events": "none" }),
      x,
    });
    const rFb = cellX.fb.map((x) => mkCell(x, "fb", false));
    const rPb = cellX.pb.map((x) => x !== null && mkCell(x, "pb", true));
    const noteFb = text(gRing, { x: PX, y: RY + CH + 16, text: "fb: keep going in my own lane", "font-size": 10.5, fill: C.soft });
    const notePb = text(gRing, { x: PX, y: RY + CH + 32, text: "pb: and glance at the lane next door", "font-size": 10.5, fill: C.soft });
    // 回到 NONE 之後 ring 收掉，原處留一句
    const noteNone = text(gPanel, { x: PX, y: RY + CH / 2, text: "M's ring: plain rows again", "font-size": 11, fill: C.soft, opacity: 0 });

    // 結果：兩個 slot
    const QX = 344;
    text(gRing, { x: QX, y: 186, text: "result[M]", "font-size": 11.5, fill: C.soft });
    const slots = [0, 1].map((i) => {
      const y = RY + i * 32;
      text(gRing, { x: QX, y: y + CH / 2 + 0.5, text: ["mine", "left"][i], "font-size": 11, fill: C.soft });
      const box = el("rect", { x: QX + 50, y, width: 92, height: CH, fill: C.sheet, stroke: C.ink, "stroke-width": 1 }, gRing);
      const txt = text(gRing, { x: QX + 96, y: y + CH / 2 + 0.5, text: "", "text-anchor": "middle", "font-size": 11.5, "font-weight": 600 });
      return { box, txt, y };
    });

    // 狀態：一圈四個，現在的那個塗實
    const SX = 528, SW = 112, SH = 22;
    text(gPanel, { x: SX, y: 186, text: "state", "font-size": 11.5, fill: C.soft });
    const STATES = ["NONE", "PROBING", "TRANSITION", "DONE"];
    const sChips = STATES.map((s, i) => {
      const y = RY + i * 30;
      const box = el("rect", { x: SX, y, width: SW, height: SH, rx: SH / 2, fill: C.sheet, stroke: C.soft, "stroke-width": 1 }, gPanel);
      const lbl = text(gPanel, { x: SX + SW / 2, y: y + SH / 2 + 0.5, text: s, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: C.soft });
      if (i < 3) el("path", { d: `M${SX + SW / 2},${y + SH + 1} v5 m-3,-3 l3,3 l3,-3`, fill: "none", stroke: C.soft, "stroke-width": 1 }, gPanel);
      return { box, lbl };
    });
    const yTop = RY + SH / 2, yBot = RY + 3 * 30 + SH / 2;
    el("path", { d: `M${SX + SW + 1},${yBot} h10 V${yTop} h-9 m4,-3 l-4,3 l4,3`, fill: "none", stroke: C.soft, "stroke-width": 1 }, gPanel);

    // 面板一側的光暈
    const hlBox = (x, y, w, h) => el("rect", { x: x - 2.5, y: y - 2.5, width: w + 5, height: h + 5, rx: 3, fill: "none", stroke: C.teal, "stroke-width": 1.5, opacity: 0, "pointer-events": "none" }, gRing);
    const fbHL = rFb.map((c) => hlBox(c.x, RY, CW, CH));
    const pbHL = rPb.map((c) => c && hlBox(c.x, RY, CW, CH));
    const slotHL = slots.map((s) => hlBox(QX + 50, s.y, 92, CH));

    // 對應：fb_i ↔ 自己車道第 i 段，pb_i ↔ 左車道第 i 段；slot 0 ↔ 全部 fb，slot 1 ↔ 全部 pb
    const PAIR = {};
    for (let i = 0; i < 4; i++) {
      PAIR[`fb${i}`] = { fb: [i] };
      if (i) { PAIR[`pb${i}`] = { pb: [i] }; PAIR[`g${i}`] = { fb: [i], pb: [i] }; }
    }
    PAIR.slot0 = { fb: [0, 1, 2, 3], slot: [0] };
    PAIR.slot1 = { pb: [1, 2, 3], slot: [1] };
    const PULSE = [["fb0", 2.2], ["g1", 2.8], ["g2", 3.4], ["g3", 4.0], ["slot0", 5.0], ["slot1", 5.8]];
    let hover = null, lastT = 0;
    const applyHL = () => {
      const lv = { fb: [0, 0, 0, 0], pb: [0, 0, 0, 0], slot: [0, 0] };
      const add = (key, v) => { const m = PAIR[key]; for (const k in m) for (const i of m[k]) lv[k][i] = Math.max(lv[k][i], v); };
      for (const [k, f] of PULSE) {
        const u = (lastT - B(BEAT.ring, f)) / 0.9;
        if (u > 0 && u < 1) add(k, Math.sin(Math.PI * u));
      }
      // 試探的出價還在路上時才對應得起來
      if (hover && lastT >= B(BEAT.ring, 1.2) && lastT < B(BEAT.accept, 1.4)) add(hover, 1);
      srcHL.forEach((e, i) => set(e, { opacity: lv.fb[i] }));
      fbHL.forEach((e, i) => set(e, { opacity: lv.fb[i] }));
      dstHL.forEach((e, i) => e && set(e, { opacity: lv.pb[i] }));
      pbHL.forEach((e, i) => e && set(e, { opacity: lv.pb[i] }));
      slotHL.forEach((e, i) => set(e, { opacity: lv.slot[i] }));
    };
    const hoverable = (node, key) => {
      node.addEventListener("pointerenter", () => { hover = key; applyHL(); });
      node.addEventListener("pointerleave", () => { if (hover === key) { hover = null; applyHL(); } });
    };
    rFb.forEach((c, i) => hoverable(c.box, `fb${i}`));
    rPb.forEach((c, i) => c && hoverable(c.box, `pb${i}`));
    slots.forEach((s, i) => hoverable(s.box, `slot${i}`));
    // 地圖這一側的感應區也跟著 M 走
    const gHit = el("g", {}, gRel);
    SRC.forEach(([x0, x1], i) => hoverable(el("rect", { x: x0, y: RCY, width: x1 - x0, height: LW, fill: "transparent", "pointer-events": "all" }, gHit), `fb${i}`));
    DST.forEach((r, i) => r && hoverable(el("rect", { x: r[0], y: RY0, width: r[1] - r[0], height: LW, fill: "transparent", "pointer-events": "all" }, gHit), `pb${i}`));

    // 一路累積下來的規則
    const rules = [
      "· a glance is only asking, never taking",
      "· keep driving, keep looking for a gap",
      "· both lanes say yes at once? go",
      "· once you go, nobody cuts in",
      "· across: forget the old lane",
    ].map((s, i) => text(gPanel, { x: PX - 6, y: 284 + i * 17, text: s, "font-size": 11.5, fill: C.ink, opacity: 0 }));

    // ── 動作 ──
    // 試探期間 M 照常往前開（fb 一直核准），直到試探不再輸
    const mDrive = TA.track([[B(BEAT.drive, 0.4), { x: M_START }], [B(BEAT.drive, 5.6), { x: M_ACC }]]);
    const mPose = (t) => {
      if (t < B(BEAT.move)) return { x: mDrive(t).x, y: SY, a: 0 };
      if (t < B(BEAT.done)) {
        const s = tl.p(t, BEAT.move, 0.3, 3.3) * (RUN + SLIDE);
        const k = TA.clamp01((s - RUN) / SLIDE);
        // 斜切是等速橫移；車頭的角度在頭尾各用一小段轉過去，不會一格就折過去
        const turn = TA.clamp01((s - RUN) / 12) * TA.clamp01((RUN + SLIDE - s) / 12);
        return { x: M_ACC + s, y: lerp(SY, TY, k), a: SLIDE_A * turn };
      }
      return { x: M_ACC + RUN + SLIDE + 40 * tl.p(t, BEAT.done, 0.3, 2.2), y: TY, a: 0 }; // 比前車慢一點起步，拉開間距
    };
    // 左車道那列車：試探期間幾乎不動，最後一拍一起往前
    const qX = (t, x0) => x0 + 70 * tl.p(t, BEAT.done, 0.3, 2.2);

    // 這個 M 位置下，試探跟哪幾台車重疊（[lo, hi] 是重疊的範圍）
    const overlaps = (mx, t) => {
      const d0 = mx - CAR_LEN + RUN, d1 = mx - CAR_LEN + NEED;
      return Q.map(([, x0]) => {
        const qx = qX(t, x0), lo = Math.max(d0, qx - CAR_LEN), hi = Math.min(d1, qx + PAD + EXT_Q);
        return [lo, hi];
      });
    };
    const tRes = B(BEAT.lost, 1.6);
    // 刻痕：從第一次輸開始，每隔一小段時間看一次，輸的地方留一道
    const trail = [];
    for (let ts = tRes; ts < B(BEAT.drive, 5.6); ts += 0.55) {
      const mx = mDrive(ts).x;
      if (overlaps(mx, ts).some(([lo, hi]) => hi > lo)) {
        const x = mx - CAR_LEN + RUN;
        trail.push({ ts, e: el("path", { d: `M${x - 3},${RY0 + 3} l6,6 m0,-6 l-6,6`, fill: "none", stroke: C.red, "stroke-width": 1.4, opacity: 0 }, gTrail) });
      }
    }

    const update = (t) => {
      const pIntro = tl.p(t, BEAT.intro, 0, 1.0);
      const m = mPose(t), mTail = m.x - CAR_LEN;
      TA.place(carM, m.x, m.y, m.a, tl.p(t, BEAT.intro, 0.2, 0.8));
      Q.forEach(([, x0], i) => {
        const qx = qX(t, x0);
        TA.place(carQ[i], qx, TY, 0, pIntro);
        set(qBids[i].claim, { x: qx - CAR_LEN, width: CAR_LEN + PAD, opacity: pIntro });
        set(qBids[i].ext, { x: qx + PAD, opacity: pIntro });
      });

      // 狀態
      const tProbe = B(BEAT.ring, 1.4), tTrans = B(BEAT.accept, 1.4), tDone = B(BEAT.done, 0.4), tNone = B(BEAT.done, 6.0);
      const state = t >= tNone ? 0 : t >= tDone ? 3 : t >= tTrans ? 2 : t >= tProbe ? 1 : 0;
      sChips.forEach((c, i) => {
        const on = i === state;
        set(c.box, { fill: on ? (i === 0 ? C.ink : color.M) : C.sheet, stroke: on ? (i === 0 ? C.ink : color.M) : C.soft });
        set(c.lbl, { fill: on ? C.onSolid : C.soft });
      });
      // 方向燈：試探到換完都在閃
      const blinkOn = t >= tProbe && t < tDone && Math.floor((t - tProbe) * 2.4) % 2 === 0;
      set(blinker, { opacity: blinkOn ? 1 : 0 });

      // 試探那一組跟著 M 平移；握住之後不再跟（M 已經停在 M_ACC 起跑）
      const dx = Math.min(m.x, M_ACC) - M_START;
      set(gRel, { transform: `translate(${dx.toFixed(2)} 0)` });

      // M 平常的出價：換道前在自己車道，換完在新車道
      const normPre = tl.p(t, BEAT.intro, 0.6, 0.8) * (1 - tl.p(t, BEAT.plan, 0, 0.6));
      const normPost = tl.p(t, BEAT.done, 0.4, 0.6);
      const normY = t >= B(BEAT.done) ? TY : SY;
      set(mClaim, { x: mTail, y: bandY(normY), width: CAR_LEN + PAD, opacity: Math.max(normPre, normPost) });
      set(mExt, { x: m.x + PAD, y: bandY(normY), opacity: Math.max(normPre, normPost) });

      // 算出來的範圍：plan 那拍出現，ring 那拍變成真的出價
      const pPlan = tl.p(t, BEAT.plan, 0.4, 0.8);
      const planOut = tl.p(t, BEAT.ring, 1.4, 0.6);
      set(planSrc, { opacity: pPlan * (1 - planOut) });
      set(planDst, { opacity: tl.p(t, BEAT.plan, 1.4, 0.8) * (1 - planOut) });
      set(gDim, { opacity: tl.p(t, BEAT.plan, 0.8, 0.8) * (1 - tl.p(t, BEAT.lost, 0, 0.6)) });
      set(gGuide, { opacity: tl.p(t, BEAT.plan, 2.4, 0.8) * (1 - tl.p(t, BEAT.lost, 0, 0.6)) + tl.p(t, BEAT.accept, 1.6, 0.6) * (1 - tl.p(t, BEAT.done, 0.2, 0.6)) });

      // 試探：fb、pb 出價；pb 跟左車道的車重疊的部分輸掉
      const probeIn = tl.p(t, BEAT.ring, 1.4, 0.8);
      const held = t >= tTrans;
      const resOn = t >= tRes;
      const ovs = overlaps(Math.min(m.x, M_ACC), t);
      const lostAny = !held && ovs.some(([lo, hi]) => hi > lo);
      const okAll = resOn && !lostAny;
      set(gProbe, { opacity: held ? 0 : probeIn });
      fb.forEach((e) => set(e, { stroke: resOn ? C.teal : color.M, "stroke-width": resOn ? 2 : 1 }));
      pb.forEach((e) => e && set(e, { stroke: okAll ? C.teal : color.M, "stroke-width": okAll ? 2 : 1 }));
      pbLost.forEach((e, i) => {
        const [lo, hi] = ovs[i];
        set(e, { x: lo, width: Math.max(0, hi - lo), opacity: resOn && !held && hi > lo ? 1 : 0 });
      });
      // 每段 pb 是否輸（相對座標的 DST 加上 dx）
      const pbLostAt = DST.map((r) => r && ovs.some(([lo, hi]) => Math.min(hi, r[1] + dx) > Math.max(lo, r[0] + dx)));

      // 刻痕與切入點
      const trailOut = tl.p(t, BEAT.move, 0, 0.6);
      for (const { ts, e } of trail) set(e, { opacity: TA.clamp01((t - ts) / 0.3) * (1 - trailOut) * 0.85 });
      const cx = Math.min(m.x, M_ACC) - CAR_LEN + RUN;
      set(cutLine, { x1: cx, x2: cx, stroke: okAll ? C.teal : color.M });
      set(cutLbl, { x: cx, text: okAll ? "cut in here" : "cut-in point?", fill: okAll ? C.teal : color.M });
      set(gCut, { opacity: tl.p(t, BEAT.lost, 0.6, 0.6) * (1 - tl.p(t, BEAT.move, 0.3, 0.6)) });

      // 握住：自己車道從車尾起，左車道從助跑的終點起；換完之後放掉
      const pHeld = tl.p(t, BEAT.accept, 1.4, 0.5);
      const heldOut = tl.p(t, BEAT.done, 0.4, 0.6);
      set(gHeld, { opacity: held ? pHeld * (1 - heldOut) : 0 });
      set(heldSrc, { x: mTail, width: Math.max(0, END_ACC - mTail) });
      set(heldTxt[0], { opacity: END_ACC - mTail > 40 ? 1 : 0 });

      // ── 面板 ──
      const ringOut = TA.clamp01((t - tNone) / 0.8);
      set(gRing, { opacity: tl.p(t, BEAT.ring, 0, 0.5) * (1 - ringOut) });
      set(noteNone, { opacity: TA.clamp01((t - tNone - 0.6) / 0.6) });
      const done = t >= tDone;
      const cellStyle = (c, i, isPb) => {
        const pr = tl.p(t, BEAT.ring, 0.2 + (isPb ? i * 0.3 + 0.15 : i * 0.3), 0.5);
        const lost = isPb && resOn && !held && pbLostAt[i];
        const ok = resOn && !held && !lost && (!isPb || okAll);
        const skipped = done && !isPb;
        set(c.box, { opacity: pr * (skipped ? 0.3 : 1), stroke: lost ? C.red : ok ? C.teal : color.M, fill: held && !skipped ? color.M : lost ? C.lost : C.sheet, "stroke-width": ok || lost ? 2 : 1.2 });
        set(c.lbl, { opacity: pr * (skipped ? 0.3 : 1), fill: held && !skipped ? C.onSolid : lost ? C.red : color.M });
      };
      rFb.forEach((c, i) => cellStyle(c, i, false));
      rPb.forEach((c, i) => c && cellStyle(c, i, true));
      set(noteFb, { opacity: tl.p(t, BEAT.ring, 1.0, 0.5), text: done ? "fb: not needed, already across" : "fb: keep going in my own lane" });
      set(notePb, { opacity: tl.p(t, BEAT.ring, 1.4, 0.5) });
      const res = [
        done ? ["skipped", C.soft] : resOn ? ["approved", C.teal] : ["", C.ink],
        resOn ? (lostAny ? ["lost", C.red] : ["approved", C.teal]) : ["", C.ink],
      ];
      if (held && !done) { res[0] = ["held · 255", color.M]; res[1] = ["held · 255", color.M]; }
      slots.forEach((s, i) => {
        set(s.txt, { text: res[i][0], fill: res[i][1] });
        set(s.box, { stroke: res[i][0] ? res[i][1] : C.ink });
      });

      const ruleAt = [B(BEAT.lost, 2.4), B(BEAT.drive, 6.0), B(BEAT.accept, 2.0), B(BEAT.move, 3.8), B(BEAT.done, 1.4)];
      rules.forEach((r, i) => set(r, { opacity: TA.ease(TA.clamp01((t - ruleAt[i]) / 0.6)) }));
      lastT = t;
      applyHL();
    };

    return { w: W, h: H, tl, update, cars: ["M", "A", "B", "C"] };
  };
})();
