/* CAGE · press latch
   A trackpad tap holds :active for two or three frames, which is not long enough to read
   the bottom of the key throw. This latches [data-pressing] on the pressed .cage-face for
   at least --press-hold (90ms), so the release — the part that actually carries the
   overshoot — always starts from a fully bottomed-out key.

   Drop-in, no init: <script src="assets/press-latch.js" defer></script>
   Styling lives in parts/chassis.css; this file only sets and clears the attribute. */
(() => {
  const holdMs = () => {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--press-hold").trim();
    return v.endsWith("ms") ? parseFloat(v) : v.endsWith("s") ? parseFloat(v) * 1000 : 90;
  };
  let el = null, down = 0, up = false, timer = 0;
  const release = () => { if (el) el.removeAttribute("data-pressing"); el = null; timer = 0; up = false; };
  const maybeRelease = () => {
    if (!el || !up) return;
    const left = holdMs() - (performance.now() - down);
    if (left <= 0) release(); else if (!timer) timer = setTimeout(release, left);
  };
  addEventListener("pointerdown", (e) => {
    const t = e.target.closest && e.target.closest(".cage-face");
    if (!t || t.getAttribute("aria-disabled") === "true") return;
    if (timer) { clearTimeout(timer); timer = 0; }
    if (el && el !== t) el.removeAttribute("data-pressing");
    el = t; down = performance.now(); up = false;
    el.setAttribute("data-pressing", "");
  }, true);
  for (const ev of ["pointerup", "pointercancel", "blur"]) {
    addEventListener(ev, () => { up = true; maybeRelease(); }, true);
  }
})();
