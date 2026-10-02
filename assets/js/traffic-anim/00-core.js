/* 交通協調的示意動畫：共用的引擎。
   不是模擬，是腳本：每張圖是一串「拍」（beat），每一拍有長度與中英兩段旁白，
   畫面是時間的純函式 update(t)——所以播放、拖曳、上一拍／下一拍都只是換一個 t。
   各圖在 10-*.js 之後登記到 TrafficAnim.scenes，99-init.js 把頁面上的 [data-anim] 接起來。 */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const TA = (window.TrafficAnim = { scenes: {} });

  // ── 時間 ──
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2); // easeInOutCubic
  const lerp = (a, b, p) => a + (b - a) * p;
  TA.clamp01 = clamp01;
  TA.ease = ease;
  TA.lerp = lerp;

  // 一張圖的時間軸：beats = [{ d: 秒, en, zh }]。at(i, f) 是第 i 拍裡 f 秒處（f 可為負或超過拍長）。
  // hold：拍長的倍數。拍內的動作都以「拍開頭 + 幾秒」排定，所以拉長拍長只延長每拍做完後的停留，
  // 不會放慢動作本身。
  TA.HOLD = 3;
  TA.timeline = (rawBeats, hold = TA.HOLD) => {
    const beats = rawBeats.map((b) => Object.assign({}, b, { d: b.d * hold }));
    const starts = [];
    let acc = 0;
    for (const b of beats) { starts.push(acc); acc += b.d; }
    return {
      beats, starts, total: acc,
      at: (i, f = 0) => starts[i] + f,
      // 第 i 拍內 [f0, f0+dur] 的進度，已 ease
      p: (t, i, f0 = 0, dur = beats[i].d - f0) => ease(clamp01((t - starts[i] - f0) / Math.max(1e-6, dur))),
      beatAt: (t) => { let k = 0; for (let i = 0; i < starts.length; i++) if (t >= starts[i] - 1e-6) k = i; return k; },
    };
  };

  // 關鍵影格：frames = [[時間, {數值屬性}], ...]，時間遞增；兩格之間 ease 插值，前後各自夾住。
  TA.track = (frames) => (t) => {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) {
      const [t1, v1] = frames[i];
      if (t <= t1) {
        const [t0, v0] = frames[i - 1];
        const p = ease(clamp01((t - t0) / Math.max(1e-6, t1 - t0)));
        const out = {};
        for (const k in v1) out[k] = typeof v1[k] === "number" && typeof v0[k] === "number" ? lerp(v0[k], v1[k], p) : (p < 1 ? v0[k] : v1[k]);
        return out;
      }
    }
    return frames[frames.length - 1][1];
  };

  // ── SVG ──
  // 屬性用 setAttribute，顏色等可吃 CSS 變數的放 style（簡報屬性不吃 var()；Chrome 放水，Firefox 不會）。
  const STYLE_KEYS = new Set(["fill", "stroke", "stop-color", "stop-opacity", "opacity", "font-family", "font-size", "font-weight", "letter-spacing", "stroke-dasharray", "fill-opacity", "stroke-opacity", "text-anchor", "dominant-baseline", "paint-order", "stroke-width", "stroke-linecap", "stroke-linejoin"]);
  const set = (el, attrs) => {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined) continue;
      if (k === "text") { if (el.textContent !== String(v)) el.textContent = v; }
      else if (STYLE_KEYS.has(k)) el.style.setProperty(k, typeof v === "number" && k !== "opacity" && k !== "fill-opacity" && k !== "stroke-opacity" && k !== "stop-opacity" && k !== "font-weight" ? v + (k === "font-size" || k === "stroke-width" ? "px" : "") : String(v));
      else el.setAttribute(k, v);
    }
    return el;
  };
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    set(e, attrs);
    if (parent) parent.appendChild(e);
    return e;
  };
  TA.set = set;
  TA.el = el;

  // 動畫的墨色：全部是 css/devlog/09-anim.css 的 --anim-* token，Bright 與 Dim 各一組值（Dim 時圖卡是暗的製圖片）。
  // 分工照設計系統：青（intensity）= 核准、給出去的路；朱紅（revision）= 被截掉、輸掉；石墨 = 結構與註記。
  // 三台車各一個收斂過的色相，另外再印 A / B / C，跟分區色票靠字辨識同一個道理。
  TA.C = {
    sheet: "var(--anim-sheet)", col: "var(--anim-col)", onSolid: "var(--anim-on-solid)", glass: "var(--anim-glass)",
    road: "var(--anim-road)", dash: "var(--anim-dash)", grid: "var(--anim-grid)",
    ink: "var(--anim-ink)", soft: "var(--anim-soft)",
    teal: "var(--anim-intensity)", red: "var(--anim-revision)", lost: "var(--anim-lost)",
    carEdge: "var(--anim-car-edge)", headlight: "var(--anim-headlight)", indicator: "var(--anim-indicator)",
    a: "var(--anim-a)", b: "var(--anim-b)", c: "var(--anim-c)",
  };
  TA.MONO = "var(--font-mono)";
  TA.LABEL = "var(--font-label)";

  // 等寬小字
  TA.text = (parent, attrs) => el("text", Object.assign({ "font-family": TA.MONO, "font-size": 12, fill: TA.C.ink, "dominant-baseline": "middle" }, attrs), parent);

  // 斜線填充（extension 用）：每個顏色一個 pattern。id 加上流水號，同一頁放兩張同場景的圖也不會撞名
  let hatchSeq = 0;
  TA.hatch = (svg, name, color) => {
    const id = `${name}-${++hatchSeq}`;
    let defs = svg.querySelector("defs") || el("defs", {}, svg);
    const p = el("pattern", { id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 6, height: 6, fill: TA.C.sheet }, p);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: color, "stroke-width": 3, opacity: 0.55 }, p);
    return `url(#${id})`;
  };

  // 車燈的 bloom：一張 svg 一個高斯模糊濾鏡，id 每張圖各自編號（同頁可能有好幾張動畫）
  let bloomSeq = 0;
  TA.bloomFilter = (node) => {
    const svg = node.ownerSVGElement || node;
    if (svg.dataset.bloom) return `url(#${svg.dataset.bloom})`;
    const id = `anim-bloom-${++bloomSeq}`;
    const defs = svg.querySelector("defs") || el("defs", {}, svg);
    const f = el("filter", { id, x: "-100%", y: "-100%", width: "300%", height: "300%" }, defs);
    el("feGaussianBlur", { stdDeviation: 2.6 }, f);
    // 光束的漸層：燈口最亮，往前淡到 0（userSpaceOnUse 以車頭為原點，車子 transform 帶著走）
    const lg = el("linearGradient", { id: `${id}-beam`, x1: -4, y1: 0, x2: 56, y2: 0, gradientUnits: "userSpaceOnUse" }, defs);
    el("stop", { offset: 0, "stop-color": "var(--anim-headlight)", "stop-opacity": 0.85 }, lg);
    el("stop", { offset: 1, "stop-color": "var(--anim-headlight)", "stop-opacity": 0 }, lg);
    svg.dataset.bloom = id;
    return `url(#${id})`;
  };
  TA.beamFill = (node) => { TA.bloomFilter(node); return `url(#${(node.ownerSVGElement || node).dataset.bloom}-beam)`; };

  // 一台車（俯視，車頭朝 +x），平面的地圖圖示風格：圓角車身、淺色座艙（前擋寬、後窗窄）、車頭兩盞小燈。
  // 不畫輪胎、玻璃不用深色——深色玻璃像眼睛、凸出的輪胎像腳，整台車會像青蛙。
  // 原點在車頭，車身往 -x 延伸 len；比例照真車（4.5 × 1.8 m 左右）。回傳 group，用 TA.place 移動與轉向。
  TA.car = (parent, { len, wid, color, label }) => {
    const g = el("g", {}, parent);
    const C = TA.C;
    // 車身：Dim 時往黑混一點（--anim-car-shade），夜裡的車比它的出價條暗；出價條與晶片照舊用原本的車色
    el("rect", { x: -len, y: -wid / 2, width: len, height: wid, rx: wid * 0.3, fill: `color-mix(in srgb, ${color}, #000 var(--anim-car-shade))`, stroke: C.carEdge, "stroke-width": 1 }, g);
    // 座艙：車身中段偏後的一塊淺色圓角，前擋與後窗是其中更淺的兩條
    const cabX0 = -len * 0.8, cabX1 = -len * 0.3, inset = wid * 0.09;
    el("rect", { x: cabX0, y: -wid / 2 + inset, width: cabX1 - cabX0, height: wid - 2 * inset, rx: 4, fill: C.glass, "fill-opacity": 0.22 }, g);
    el("rect", { x: cabX1 - len * 0.09, y: -wid / 2 + inset, width: len * 0.09, height: wid - 2 * inset, rx: 3, fill: C.glass, "fill-opacity": 0.5 }, g);
    el("rect", { x: cabX0, y: -wid / 2 + inset + 1, width: len * 0.05, height: wid - 2 * inset - 2, rx: 2, fill: C.glass, "fill-opacity": 0.4 }, g);
    // 引擎蓋：前擋往車頭的兩條細線
    for (const side of [-1, 1]) el("line", { x1: cabX1 + 3, y1: side * wid * 0.2, x2: -len * 0.1, y2: side * wid * 0.14, stroke: C.glass, "stroke-opacity": 0.4, "stroke-width": 1, "stroke-linecap": "round" }, g);
    // 車燈：離車頭一點點。Bright 是白天，燈是淺色、不發光；Dim 是夜裡，暖黃燈加一點 bloom——
    // 兩盞燈各一道錐形光束往前張開、略往外偏、越遠越淡（漸層＋一點模糊），燈口一小點亮光。
    // 光束與燈口的光只在 Dim 出現（--anim-bloom）。
    const bloom = TA.bloomFilter(parent);
    const beam = TA.beamFill(parent);
    // 光束與燈口的光放在同一組，TA.lights 可以把整組收小、調暗（例如輸了、在等的車）
    const glow = el("g", { opacity: "var(--anim-bloom)" }, g);
    g._glow = glow;
    for (const side of [-1, 1]) {
      const ly = side * wid * 0.3;
      // 錐形：燈口寬 4，往前 52。朝外的邊再往外 13；朝內的邊越過車頭中線 13，兩道光在車頭前方交疊成一片
      const outer = ly + side * 13, inner = -side * 13;
      const d = `M-3,${ly - 2} L52,${Math.min(outer, inner)} L52,${Math.max(outer, inner)} L-3,${ly + 2} Z`;
      el("path", { d, fill: beam, filter: bloom }, glow);
      el("circle", { cx: -4, cy: ly, r: 2.6, fill: C.headlight, filter: bloom }, glow);
      el("rect", { x: -6, y: ly - 2.5, width: 2.5, height: 5, rx: 1, fill: C.headlight, "fill-opacity": 0.9 }, g);
    }
    const lx = (cabX0 + cabX1) / 2 - len * 0.03;
    g._label = TA.text(g, { x: lx, y: 0.5, text: label, "text-anchor": "middle", fill: C.onSolid, "font-weight": 600, "font-size": 12 });
    g._labelX = lx;
    return g;
  };
  // 車燈的強度：1 = 照常，0 = 收到最小（光束縮短、變暗，燈口還留一點）。只在 Dim 看得到
  TA.lights = (g, k = 1) => set(g._glow, {
    transform: `translate(-4 0) scale(${(0.35 + 0.65 * k).toFixed(3)}) translate(4 0)`,
    opacity: `calc(var(--anim-bloom) * ${(0.45 + 0.55 * k).toFixed(3)})`,
  });
  // 車的原點在車頭；transform 放在車頭位置，angle 為度。車頭朝左半邊時，車上的字原地轉半圈，不會倒著印
  TA.place = (g, x, y, angle = 0, opacity = 1) => {
    if (g._label) {
      const flip = Math.cos((angle * Math.PI) / 180) < -0.01;
      set(g._label, { transform: flip ? `rotate(180 ${g._labelX} 0)` : "" });
    }
    return set(g, { transform: `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${angle.toFixed(2)})`, opacity });
  };

  TA.lang = () => ((document.documentElement.lang || "en").toLowerCase().startsWith("zh") ? "zh" : "en");
})();
