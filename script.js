const contactHeadingSlot = document.getElementById('contactHeadingSlot');
const contactSentinel = document.getElementById('contactSentinel');
const contactHeading = document.getElementById('contactHeading');
const markBarSlot = document.getElementById('markBarSlot');
const markBar = document.getElementById('markBar');
const mark = document.getElementById('mark');

const EARLY_THRESHOLD = 24; // scroll past this before "Contact" appears pinned
const HYSTERESIS = 16; // px of scroll buffer at each boundary before it can flip back

const FADE_MS = 350; // duration of the "Contact" fade-in/out, driven by real elapsed time (see below)

const MARK_SETTLED_HEIGHT = 46; // px -- the logomark's normal (pinned) height
const MARK_SETTLED_WIDTH = (MARK_SETTLED_HEIGHT * 347) / 450; // same aspect ratio as the sprite frames

let markNaturalTop = 0; // document-relative Y of the logomark's natural (centered) position, measured at its full intro size
let markIntroHeight = 0; // px -- current computed value of --mark-intro-height (responsive, see styles.css)
let markPinScrollY = 0; // scrollY at which the shrinking mark's natural position actually reaches the viewport top (see markPinScrollY comment in measure())
let markEverPinned = false; // one-way latch: true forever once scroll ever reaches markPinScrollY

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

// One-time (+resize) layout measurements: how tall the slot needs to
// be to reserve Contact's natural space in the column, how wide the
// locked heading should render (position: fixed doesn't inherit width
// from its parent the way normal flow would), the logomark's natural
// top (the scroll-linked scale/pin threshold), and its current
// (responsive) intro size. These don't need to be live -- a stale
// reserved height/width from a later font swap is at worst a few px
// of layout looseness, not a threshold bug. contactHeadingSlot's own
// explicit height IS cleared before reading its rect, though: leaving
// it set would make getBoundingClientRect() just report that same
// stale value back on every subsequent call (rather than the natural
// content height), permanently locking in whatever was measured the
// very first time. (markBarSlot's reserved height is handled
// separately, right at the moment the mark actually pins -- see
// update() -- since unlike Contact, the mark's own size continuously
// changes while scrolling, so there's no single "natural" height to
// cache here.)
function measure() {
  const prevClasses = [...contactHeading.classList].filter((c) => c !== 'contact-heading');
  contactHeading.classList.remove(...prevClasses);
  contactHeadingSlot.style.height = '';
  const rect = contactHeadingSlot.getBoundingClientRect();
  contactHeadingSlot.style.height = rect.height + 'px';
  contactHeading.style.setProperty('--locked-width', rect.width + 'px');
  contactHeading.classList.add(...prevClasses);

  // getPropertyValue('--mark-intro-height') on :root would return the
  // literal unresolved "clamp(100px, 13vw, 240px)" expression (custom
  // properties don't get resolved to a computed pixel value the way
  // ordinary properties do) -- parseFloat on that is NaN, which
  // silently breaks every mark.style.height assignment downstream (an
  // invalid CSS value is just ignored, not an error). Reading it off
  // .mark's own *resolved* height instead requires clearing any
  // inline override first, since that would otherwise report back
  // whatever was last set rather than the fresh clamp() value -- the
  // update() call right after every measure() call re-sets it anyway.
  mark.style.height = '';
  mark.style.width = '';
  markIntroHeight = parseFloat(getComputedStyle(mark).height);

  const wasPinned = markBar.classList.contains('is-pinned');
  if (wasPinned) markBar.classList.remove('is-pinned');
  markNaturalTop = markBarSlot.getBoundingClientRect().top + window.scrollY;
  if (wasPinned) markBar.classList.add('is-pinned');

  // markNaturalTop alone isn't the right pin/lock trigger: .site-header
  // vertically centers its content (justify-content: center), and the
  // mark's own height is exactly what's shrinking as scroll progresses
  // toward that point -- so the slot's *live* natural position keeps
  // drifting downward as the mark shrinks (centering always splits a
  // height change evenly above/below the centered block, so losing
  // height pushes the top edge down by half as much). A trigger fired
  // at the raw markNaturalTop -- measured back at full (unshrunk) size
  // -- fires early: the live position is still (markIntroHeight -
  // MARK_SETTLED_HEIGHT) / 2 px below the viewport top at that moment,
  // so snapping straight to position: fixed; top: 0 is a visible jump.
  // Solving for the scrollY where the shrinking box's own live position
  // actually reaches 0 -- self-consistently, since the shrink amount at
  // that point is itself a function of how close scroll has gotten to
  // it -- adds exactly that same half-the-total-shrink offset back on.
  markPinScrollY = markNaturalTop + (markIntroHeight - MARK_SETTLED_HEIGHT) / 2;
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

  // Logomark size: continuously tied to how far scroll has progressed
  // toward markPinScrollY (0 = markIntroHeight, 1 = MARK_SETTLED_HEIGHT)
  // -- a scrubber, reversible in either direction, UNTIL scroll has
  // ever reached markPinScrollY at least once (markEverPinned), at
  // which point it's locked at the settled size for good, even if
  // scrolled back up past that point afterward. markPinScrollY (not
  // the raw markNaturalTop) is the threshold both here and in the pin
  // logic below -- see the comment on it in measure() for why.
  if (!markEverPinned && y > markPinScrollY) markEverPinned = true;
  const scaleProgress = markEverPinned
    ? 1
    : markPinScrollY > 0
      ? Math.min(1, Math.max(0, y / markPinScrollY))
      : 1;
  const markHeight = markIntroHeight + (MARK_SETTLED_HEIGHT - markIntroHeight) * scaleProgress;
  mark.style.height = markHeight + 'px';
  mark.style.width = (markHeight * 347) / 450 + 'px';

  // Logomark pin: pins to the top once scrolling brings its natural
  // (centered-in-header) position within reach of the top, and stays
  // pinned for the rest of the page -- position: fixed isn't bounded
  // by a containing block the way sticky is, so this is simple JS
  // rather than needing sticky's native release/re-engage behavior.
  // Same hysteresis buffer as above, for the same reason. Separate
  // from the (one-way) scale above -- un-pinning (scrolling back up
  // past the buffer) can still happen and is fully reversible; only
  // the size stays locked. markBarSlot's reserved height (needed once
  // mark-bar is removed from flow) is captured right at this
  // transition, by which point the scale update above has already
  // sized the mark for the current scroll position, rather than
  // cached once up front the way contactHeadingSlot's is -- the mark's
  // own natural height keeps changing while scrolling, so there's no
  // single natural value to cache ahead of time.
  if (markIsPinned) {
    if (y < markPinScrollY - HYSTERESIS) {
      markIsPinned = false;
      markBarSlot.style.height = '';
    }
  } else if (y > markPinScrollY) {
    markBarSlot.style.height = markBarSlot.getBoundingClientRect().height + 'px';
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
// smooth instead of jumpy. This is independent of the mark's size,
// which is handled continuously in update() above -- frame and size
// are separate concerns sharing the same element.
const MARK_FRAME_COUNT = 14; // must match .mark's background-size (1400% = 14 frames) in styles.css
const MARK_FRAME_MS = 80; // playback speed while animating
const MARK_SCROLL_IDLE_MS = 150; // how long without a scroll event before "stopped"

let markFrame = 0;
let markTimer = null;
let markSettling = false;
let markIdleTimer = null;

function setMarkFrame(i) {
  markFrame = ((i % MARK_FRAME_COUNT) + MARK_FRAME_COUNT) % MARK_FRAME_COUNT;
  // Percentage positioning (not pixels) so this stays correctly
  // aligned regardless of .mark's current rendered size -- see the
  // comment above .mark in styles.css for why.
  mark.style.backgroundPositionX = (markFrame / (MARK_FRAME_COUNT - 1)) * 100 + '%';
}

function stepMarkFrame() {
  const next = markFrame + 1;
  if (markSettling && next % MARK_FRAME_COUNT === 0) {
    setMarkFrame(0);
    clearInterval(markTimer);
    markTimer = null;
    markSettling = false;
    return;
  }
  setMarkFrame(next);
}

function onScrollForMark() {
  markSettling = false;
  if (markTimer === null) markTimer = setInterval(stepMarkFrame, MARK_FRAME_MS);

  clearTimeout(markIdleTimer);
  markIdleTimer = setTimeout(() => {
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
// scroll like it does from then on. The very first scroll event just
// stops this auto-loop timer -- frame-stepping immediately picks up
// the normal scroll-driven behavior above (onScrollForMark is already
// listening for the same event), and the mark's size is already being
// handled continuously by update() regardless of this loop.
const BG_SETTLE_MS = MARK_FRAME_MS * 5; // how long the background takes to fade back to normal, below

let introTimer = setInterval(() => setMarkFrame(markFrame + 1), MARK_FRAME_MS);

function endMarkIntro() {
  clearInterval(introTimer);
  window.removeEventListener('scroll', endMarkIntro);
  endBgCycle(BG_SETTLE_MS);
}

window.addEventListener('scroll', endMarkIntro, { passive: true });

// Background color cycle: while the mark's intro loop plays (see
// above), the page background continuously, smoothly cycles through
// this 5-stop loop (the 6th stop is the 1st again, closing it) --
// BG_CYCLE_MS is a fixed, slow duration of its own rather than being
// tied to the run-cycle's speed, so it reads as a gradual, ambient
// drift (like a sunset) rather than a pulse. Driven by elapsed time
// via requestAnimationFrame (not a CSS transition) for genuinely
// smooth interpolation regardless of frame rate, the same technique
// used for the Contact fade above.
// Applied as an inline style on <body>, not by changing --bg itself:
// --bg is also read by several other elements (the Contact/mark
// gradients) that must stay the normal, unanimated color throughout.
// ~26% more saturated (in HSL) than the original EAEBF5/F5F4EA/F5EAEA/
// EAF5F0/F5EAF3 palette (two successive boosts: 10%, then another
// 15%) -- a modest shift in raw RGB terms since these pastels sit at
// ~94% lightness, where HSL saturation has little room to move the
// channels regardless of the percentage applied.
const BG_CYCLE_COLORS = [
  [0xe8, 0xea, 0xf7], // E8EAF7
  [0xf7, 0xf5, 0xe8], // F7F5E8
  [0xf7, 0xe8, 0xe8], // F7E8E8
  [0xe8, 0xf7, 0xf0], // E8F7F0
  [0xf7, 0xe8, 0xf4], // F7E8F4
  [0xe8, 0xea, 0xf7], // E8EAF7 -- closes the loop
];
const BG_CYCLE_MS = 15000; // one full loop -- slow, ambient, not synced to the run-cycle
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
  const bgColor = lerpColor(BG_CYCLE_COLORS[seg], BG_CYCLE_COLORS[seg + 1], segT);
  document.body.style.backgroundColor = colorToCss(bgColor);
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
