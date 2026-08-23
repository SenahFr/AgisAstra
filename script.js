const contactHeadingSlot = document.getElementById('contactHeadingSlot');
const contactSentinel = document.getElementById('contactSentinel');
const contactHeading = document.getElementById('contactHeading');
const markBarSlot = document.getElementById('markBarSlot');
const markBar = document.getElementById('markBar');
const mark = document.getElementById('mark');

const EARLY_THRESHOLD = 24; // scroll past this before "Contact" appears pinned
const HYSTERESIS = 16; // px of scroll buffer at each boundary before it can flip back

const FADE_MS = 350; // duration of the "Contact" fade-in/out, driven by real elapsed time (see below)

let markNaturalTop = 0; // document-relative Y of the logomark's natural (centered) position

// Latched state, not recomputed from scratch every frame: without a
// buffer, tiny scroll jitter right at a boundary (trackpad momentum,
// rubber-banding) flips a class back and forth many times a second --
// each flip is a real layout change (is-pinned/is-locked render at
// different offsets), so that showed up as a visible flicker/jump.
let isLocked = false;
let isVisible = false;
let markIsPinned = false;

// The fade is animated by hand, over real elapsed time via
// requestAnimationFrame, rather than a CSS transition triggered by a
// class toggle. A CSS transition only animates if the browser gets to
// paint the "before" state (opacity: 0) at least once before the
// "after" class is applied -- but a single ordinary scroll input (a
// mouse-wheel notch or trackpad tick is very often 40-100+px) can push
// scrollY past both the "start pinning" and "EARLY_THRESHOLD" marks in
// the same scroll event, so is-pinned and is-visible would both get
// added in the same synchronous update() call with no frame in
// between -- opacity jumps straight to 1 with nothing to fade from.
// Driving it by elapsed time instead guarantees a real multi-frame
// fade regardless of how big any single scroll step was.
let fadeTarget = 0;
let fadeCurrent = 0;
let fadeStartValue = 0;
let fadeStartTime = 0;
let fadeRafId = null;

function setFadeTarget(target) {
  if (target === fadeTarget) return;
  fadeTarget = target;
  fadeStartValue = fadeCurrent;
  fadeStartTime = performance.now();
  if (fadeRafId === null) fadeRafId = requestAnimationFrame(stepFade);
}

function stepFade(now) {
  const t = Math.min(1, (now - fadeStartTime) / FADE_MS);
  fadeCurrent = fadeStartValue + (fadeTarget - fadeStartValue) * t;
  contactHeading.style.opacity = fadeCurrent;
  contactHeading.style.pointerEvents = fadeCurrent > 0.05 ? 'auto' : 'none';
  if (t < 1) {
    fadeRafId = requestAnimationFrame(stepFade);
  } else {
    fadeRafId = null;
  }
}

// One-time (+resize, +after the mark's intro shrink) layout
// measurements: how tall the slot needs to be to reserve Contact's
// natural space in the column, and how wide the locked heading should
// render (position: fixed doesn't inherit width from its parent the
// way normal flow would). These don't need to be live -- a stale
// reserved height/width from a later font swap is at worst a few px
// of layout looseness, not a threshold bug. Each slot's own explicit
// height IS cleared before reading its rect, though: leaving it set
// would make getBoundingClientRect() just report that same stale
// value back on every subsequent call (rather than the natural
// content height), permanently locking in whatever was measured the
// very first time.
function measure() {
  const prevClasses = [...contactHeading.classList].filter((c) => c !== 'contact-heading');
  contactHeading.classList.remove(...prevClasses);
  contactHeadingSlot.style.height = '';
  const rect = contactHeadingSlot.getBoundingClientRect();
  contactHeadingSlot.style.height = rect.height + 'px';
  contactHeading.style.setProperty('--locked-width', rect.width + 'px');
  contactHeading.classList.add(...prevClasses);

  const prevMarkClasses = [...markBar.classList].filter((c) => c !== 'mark-bar');
  markBar.classList.remove(...prevMarkClasses);
  markBarSlot.style.height = '';
  const markRect = markBarSlot.getBoundingClientRect();
  markNaturalTop = markRect.top + window.scrollY;
  markBarSlot.style.height = markRect.height + 'px';
  markBar.classList.add(...prevMarkClasses);
}

function update() {
  const y = window.scrollY;

  // contactSentinel sits in normal flow immediately before Contact's
  // slot, so its live distance from the top of the viewport each frame
  // is exactly "how much further until Contact's natural spot reaches
  // the top" -- reading it fresh every time (rather than relying on a
  // single cached measurement) means this boundary can't go stale if a
  // web font swap reflows the page after load.
  const sentinelTop = contactSentinel.getBoundingClientRect().top;

  if (isLocked) {
    if (sentinelTop > HYSTERESIS) isLocked = false;
  } else if (sentinelTop <= 0) {
    isLocked = true;
  }

  if (isVisible) {
    if (y <= EARLY_THRESHOLD - HYSTERESIS) isVisible = false;
  } else if (y > EARLY_THRESHOLD) {
    isVisible = true;
  }

  const shouldPin = y > 0 && !isLocked;

  contactHeading.classList.toggle('is-pinned', shouldPin);
  contactHeading.classList.toggle('is-locked', isLocked);

  if (isLocked) {
    // Once locked it's simply always fully visible -- no fade needed,
    // and nothing left to animate away from. Set (not clear) the
    // inline style explicitly: if this later un-locks back to
    // is-pinned, that class's CSS fallback is opacity: 0, and this
    // inline value needs to already say 1 so it doesn't flash empty
    // for a frame before the fade logic below catches up.
    fadeTarget = 1;
    fadeCurrent = 1;
    if (fadeRafId !== null) {
      cancelAnimationFrame(fadeRafId);
      fadeRafId = null;
    }
    contactHeading.style.opacity = 1;
    contactHeading.style.pointerEvents = 'auto';
  } else {
    setFadeTarget(shouldPin && isVisible ? 1 : 0);
  }

  // Logomark: pins to the top once scrolling brings its natural
  // (centered-in-header) position within reach of the top, and stays
  // pinned for the rest of the page -- position: fixed isn't bounded
  // by a containing block the way sticky is, so this is simple JS
  // rather than needing sticky's native release/re-engage behavior.
  // Same hysteresis buffer as above, for the same reason. Unchanged
  // from before.
  if (markIsPinned) {
    if (y < markNaturalTop - HYSTERESIS) markIsPinned = false;
  } else if (y > markNaturalTop) {
    markIsPinned = true;
  }
  markBar.classList.toggle('is-pinned', markIsPinned);
}

measure();
update();

window.addEventListener('scroll', update, { passive: true });
window.addEventListener('resize', () => {
  measure();
  update();
});

// Mark run-cycle sprite: steps through frames while the page is
// scrolling, driven by a fixed-interval timer rather than the scroll
// event itself (scroll events fire far faster than a legible run-cycle
// frame rate). Once scrolling stops, rather than snapping back to
// frame 0, it keeps stepping forward at the same rate -- finishing
// out the current stride -- until it naturally lands on frame 0, then
// stops there. That "settle" behavior is what makes the return look
// smooth instead of jumpy.
const MARK_FRAME_COUNT = 14; // must match .mark's background-size (1400% = 14 frames) in styles.css
const MARK_FRAME_MS = 80; // playback speed while animating
const MARK_SCROLL_IDLE_MS = 150; // how long without a scroll event before "stopped"
const MARK_SETTLED_HEIGHT = 46; // px -- must match .mark.is-settled in styles.css
const MARK_SETTLED_WIDTH = (MARK_SETTLED_HEIGHT * 347) / 450;

let markFrame = 0;
let markTimer = null;
let markSettling = false;
let markIdleTimer = null;

// The intro's shrink (from --mark-intro-height down to 46px) happens
// in the same discrete per-frame steps as the run-cycle itself, not a
// separate smooth CSS transition on its own timeline. endMarkIntro()
// sets shrinkStepsTotal to exactly the number of ticks the forced
// settle-to-frame-0 it also kicks off will take, so shrinkStepsDone
// (counted up by applyShrinkStep() alongside every setMarkFrame() call)
// always reaches shrinkStepsTotal on the same tick markFrame reaches 0.
let shrinkStepsTotal = 0;
let shrinkStepsDone = 0;
let shrinkStartHeight = 0;
let shrinkStartWidth = 0;

function setMarkFrame(i) {
  markFrame = ((i % MARK_FRAME_COUNT) + MARK_FRAME_COUNT) % MARK_FRAME_COUNT;
  // Percentage positioning (not pixels) so this stays correctly
  // aligned regardless of .mark's current rendered size -- see the
  // comment above .mark in styles.css for why.
  mark.style.backgroundPositionX = (markFrame / (MARK_FRAME_COUNT - 1)) * 100 + '%';
}

function applyShrinkStep() {
  if (shrinkStepsTotal === 0) return;
  shrinkStepsDone++;
  const t = shrinkStepsDone / shrinkStepsTotal;
  mark.style.height = shrinkStartHeight + (MARK_SETTLED_HEIGHT - shrinkStartHeight) * t + 'px';
  mark.style.width = shrinkStartWidth + (MARK_SETTLED_WIDTH - shrinkStartWidth) * t + 'px';
  if (shrinkStepsDone >= shrinkStepsTotal) {
    shrinkStepsTotal = 0;
    shrinkStepsDone = 0;
    // Hand off to the CSS rule (exact values, no lingering rounding)
    // now that it's fully caught up to what that rule specifies.
    mark.style.height = '';
    mark.style.width = '';
    mark.classList.add('is-settled');
    // measure() ran once on load while the mark was still at its
    // (much taller) intro size -- markBarSlot's reserved height and
    // markNaturalTop (the pin threshold) were captured from that,
    // now-stale, layout. Re-measure against the real settled layout
    // so neither is left oversized/mispositioned for the rest of the
    // page's life.
    measure();
    update();
  }
}

function stepMarkFrame() {
  const next = markFrame + 1;
  if (markSettling && next % MARK_FRAME_COUNT === 0) {
    setMarkFrame(0);
    applyShrinkStep();
    clearInterval(markTimer);
    markTimer = null;
    markSettling = false;
    return;
  }
  setMarkFrame(next);
  applyShrinkStep();
}

function onScrollForMark() {
  if (shrinkStepsTotal === 0) markSettling = false;
  if (markTimer === null) markTimer = setInterval(stepMarkFrame, MARK_FRAME_MS);

  clearTimeout(markIdleTimer);
  markIdleTimer = setTimeout(() => {
    if (shrinkStepsTotal > 0) return; // let the intro's forced settle-and-shrink finish undisturbed
    if (markFrame === 0) {
      clearInterval(markTimer);
      markTimer = null;
      return;
    }
    markSettling = true;
  }, MARK_SCROLL_IDLE_MS);
}

window.addEventListener('scroll', onScrollForMark, { passive: true });

// Intro: on load, before any scrolling, the mark plays its run-cycle
// continuously at --mark-intro-height (the CSS default size -- see
// .mark in styles.css) rather than only animating in response to
// scroll like it does from then on. The very first scroll event forces
// an immediate settle-to-frame-0 (regardless of whether scrolling
// continues past that point) with the shrink synced to those exact
// steps, so both finish together; from frame 0 / 46px on, it hands off
// cleanly to the normal scroll-driven behavior above.
let introTimer = setInterval(() => setMarkFrame(markFrame + 1), MARK_FRAME_MS);

function endMarkIntro() {
  clearInterval(introTimer);
  window.removeEventListener('scroll', endMarkIntro);

  const rect = mark.getBoundingClientRect();
  shrinkStartHeight = rect.height;
  shrinkStartWidth = rect.width;
  shrinkStepsTotal = MARK_FRAME_COUNT - markFrame; // steps until markFrame next wraps to 0
  shrinkStepsDone = 0;

  markSettling = true;
  if (markTimer === null) markTimer = setInterval(stepMarkFrame, MARK_FRAME_MS);

  // Background fades back to normal over exactly the same span the
  // mark takes to finish settling, so both land together.
  endBgCycle(shrinkStepsTotal * MARK_FRAME_MS);
}

window.addEventListener('scroll', endMarkIntro, { passive: true });

// Background color cycle: while the mark's intro loop plays (see
// above), the page background continuously, smoothly cycles through
// this 5-stop loop (the 6th stop is the 1st again, closing it) at half
// the run-cycle's own pace -- BG_CYCLE_MS is derived from
// MARK_FRAME_COUNT * MARK_FRAME_MS (one run-cycle lap), not a
// separately-tuned duration, just doubled. Driven by elapsed time via
// requestAnimationFrame (not a CSS transition) for genuinely smooth
// interpolation regardless of frame rate, the same technique used for
// the Contact fade above.
// Applied as an inline style on <body>, not by changing --bg itself:
// --bg is also read by several other elements (the Contact/mark
// gradients) that must stay the normal, unanimated color throughout.
const BG_CYCLE_COLORS = [
  [0xea, 0xeb, 0xf5], // EAEBF5
  [0xf5, 0xf4, 0xea], // F5F4EA
  [0xf5, 0xea, 0xea], // F5EAEA
  [0xea, 0xf5, 0xf0], // EAF5F0
  [0xf5, 0xea, 0xf3], // F5EAF3
  [0xea, 0xeb, 0xf5], // EAEBF5 -- closes the loop
];
const BG_CYCLE_MS = MARK_FRAME_COUNT * MARK_FRAME_MS * 2; // half the run-cycle's own speed -- one loop takes two laps
const BG_SEGMENT_MS = BG_CYCLE_MS / (BG_CYCLE_COLORS.length - 1);
const BG_SETTLED_COLOR = [0xf5, 0xf5, 0xf5]; // matches --bg

function lerpColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function colorToCss([r, g, b]) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function currentBodyColor() {
  const m = getComputedStyle(document.body).backgroundColor.match(/(\d+),\s*(\d+),\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : BG_CYCLE_COLORS[0];
}

let bgCycleStartTime = null;
let bgCycleRafId = null;

function stepBgCycle(now) {
  if (bgCycleStartTime === null) bgCycleStartTime = now;
  const elapsed = (now - bgCycleStartTime) % BG_CYCLE_MS;
  const seg = Math.min(BG_CYCLE_COLORS.length - 2, Math.floor(elapsed / BG_SEGMENT_MS));
  const segT = (elapsed - seg * BG_SEGMENT_MS) / BG_SEGMENT_MS;
  document.body.style.backgroundColor = colorToCss(lerpColor(BG_CYCLE_COLORS[seg], BG_CYCLE_COLORS[seg + 1], segT));
  bgCycleRafId = requestAnimationFrame(stepBgCycle);
}

bgCycleRafId = requestAnimationFrame(stepBgCycle);

let bgSettleStartTime = null;
let bgSettleDuration = 0;
let bgSettleFromColor = null;

function stepBgSettle(now) {
  if (bgSettleStartTime === null) bgSettleStartTime = now;
  const t = Math.min(1, (now - bgSettleStartTime) / bgSettleDuration);
  document.body.style.backgroundColor = colorToCss(lerpColor(bgSettleFromColor, BG_SETTLED_COLOR, t));
  if (t < 1) {
    requestAnimationFrame(stepBgSettle);
  } else {
    document.body.style.backgroundColor = ''; // hand off to the CSS var(--bg) rule
  }
}

function endBgCycle(durationMs) {
  if (bgCycleRafId !== null) {
    cancelAnimationFrame(bgCycleRafId);
    bgCycleRafId = null;
  }
  bgSettleFromColor = currentBodyColor();
  bgSettleDuration = Math.max(durationMs, 1);
  bgSettleStartTime = null;
  requestAnimationFrame(stepBgSettle);
}
