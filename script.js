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

// One-time (+resize) layout measurements: how tall the slot needs to
// be to reserve Contact's natural space in the column, and how wide
// the locked heading should render (position: fixed doesn't inherit
// width from its parent the way normal flow would). These don't need
// to be live -- a stale reserved height/width from a later font swap
// is at worst a few px of layout looseness, not a threshold bug.
function measure() {
  const prevClasses = [...contactHeading.classList].filter((c) => c !== 'contact-heading');
  contactHeading.classList.remove(...prevClasses);
  const rect = contactHeadingSlot.getBoundingClientRect();
  contactHeadingSlot.style.height = rect.height + 'px';
  contactHeading.style.setProperty('--locked-width', rect.width + 'px');
  contactHeading.classList.add(...prevClasses);

  const prevMarkClasses = [...markBar.classList].filter((c) => c !== 'mark-bar');
  markBar.classList.remove(...prevMarkClasses);
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
const MARK_FRAME_COUNT = 14;
const MARK_FRAME_WIDTH = 35; // must match .mark's width/background-size in styles.css
const MARK_FRAME_MS = 80; // playback speed while animating
const MARK_SCROLL_IDLE_MS = 150; // how long without a scroll event before "stopped"

let markFrame = 0;
let markTimer = null;
let markSettling = false;
let markIdleTimer = null;

function setMarkFrame(i) {
  markFrame = ((i % MARK_FRAME_COUNT) + MARK_FRAME_COUNT) % MARK_FRAME_COUNT;
  mark.style.backgroundPositionX = -(markFrame * MARK_FRAME_WIDTH) + 'px';
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
// continuously at 1.5x (the CSS default -- see .mark's base transform
// in styles.css) rather than only animating in response to scroll like
// it does from then on. The very first scroll event stops this loop,
// shrinks it back to 1x (.is-settled, a CSS transition so it eases
// down rather than snapping), and hands off to onScrollForMark above,
// which is already listening and will pick up wherever this loop left
// markFrame.
let introTimer = setInterval(() => setMarkFrame(markFrame + 1), MARK_FRAME_MS);

function endMarkIntro() {
  clearInterval(introTimer);
  mark.classList.add('is-settled');
  window.removeEventListener('scroll', endMarkIntro);
}

window.addEventListener('scroll', endMarkIntro, { passive: true });
