const contactHeading = document.getElementById('contactHeading');
const contactSectionHeading = document.getElementById('contactSectionHeading');
const markBarSlot = document.getElementById('markBarSlot');
const markBar = document.getElementById('markBar');
const mark = document.getElementById('mark');
const phoneLink = document.querySelector('.contact a[href^="tel:"]');
const blurb = document.querySelector('.blurb');

const EARLY_THRESHOLD = 24; // scroll past this before "Contact" appears in the header bar
const HYSTERESIS = 16; // px of scroll buffer at each boundary before it can flip back

const FADE_MS = 350; // duration of the Contact handoff crossfade, driven by real elapsed time (see below)

const MARK_SETTLED_HEIGHT = 46; // px -- the logomark's normal (pinned) height
const MARK_SETTLED_WIDTH = (MARK_SETTLED_HEIGHT * 347) / 450; // same aspect ratio as the sprite frames
const MARK_PINNED_TOP_OFFSET = 10.5; // px -- .mark-bar.is-pinned's own top padding, see markPinScrollY below

let markNaturalTop = 0; // document-relative Y of the logomark's natural (centered) position, measured at its full intro size
let markIntroHeight = 0; // px -- current computed value of --mark-intro-height (responsive, see styles.css)
let markPinScrollY = 0; // scrollY at which the shrinking mark's natural position actually reaches the viewport top (see markPinScrollY comment in measure())
let markEverPinned = false; // one-way latch: true forever once scroll ever reaches markPinScrollY

// Latched state, not recomputed from scratch every frame: without a
// buffer, tiny scroll jitter right at a boundary (trackpad momentum,
// rubber-banding) flips it back and forth many times a second -- each
// flip is a real crossfade direction change, so that showed up as a
// visible flicker.
let isContactSectionVisible = false;
let isVisible = false;
let markIsPinned = false;

// Both Contact elements' opacity/pointer-events are animated by hand,
// over real elapsed time via requestAnimationFrame, rather than a CSS
// transition triggered by a class/style toggle. A CSS transition only
// animates if the browser gets to paint the "before" state at least
// once before the "after" value is applied -- but a single ordinary
// scroll input (a mouse-wheel notch or trackpad tick is very often
// 40-100+px) can push scrollY past a visibility boundary and the next
// one in the same scroll event, with no frame painted in between, so
// opacity would jump straight to its new value with nothing to fade
// from. Driving it by elapsed time instead guarantees a real
// multi-frame fade regardless of how big any single scroll step was.
// Both elements fade independently (see the two createFader() calls
// below update()) but share this same logic and duration.
function createFader(el) {
  let target = 0;
  let current = 0;
  let startValue = 0;
  let startTime = 0;
  let rafId = null;
  function step(now) {
    const t = Math.min(1, (now - startTime) / FADE_MS);
    current = startValue + (target - startValue) * t;
    el.style.opacity = current;
    el.style.pointerEvents = current > 0.05 ? 'auto' : 'none';
    rafId = t < 1 ? requestAnimationFrame(step) : null;
  }
  return {
    setTarget(newTarget) {
      if (newTarget === target) return;
      target = newTarget;
      startValue = current;
      startTime = performance.now();
      if (rafId === null) rafId = requestAnimationFrame(step);
    },
  };
}

// One-time (+resize) layout measurements: the logomark's natural top
// (the scroll-linked scale/pin threshold) and its current (responsive)
// intro size. These don't need to be live -- a stale value from a
// later font swap is at worst a few px of layout looseness, not a
// threshold bug.
// The Y coordinate of an element's own last line of text, as rendered
// -- not just its box edge, which sits some line-height-dependent
// distance below it. Standard trick: a zero-size inline-block aligned
// to "baseline" renders exactly on the text baseline it's inserted
// next to, so appending one and reading its own rect.top gives the
// baseline's true position for free.
function baselineY(el) {
  const marker = document.createElement('span');
  marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
  el.appendChild(marker);
  const y = marker.getBoundingClientRect().top;
  marker.remove();
  return y;
}

function measure() {
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
  // so snapping straight to position: fixed; top: 0 would be a visible
  // jump. Solving for the scrollY where the shrinking box's own live
  // position actually reaches the icon's target pinned position --
  // self-consistently, since the shrink amount at that point is itself
  // a function of how close scroll has gotten to it -- adds exactly
  // that same half-the-total-shrink offset back on.
  //
  // The target isn't 0: .mark-bar.is-pinned has its own top padding
  // (MARK_PINNED_TOP_OFFSET) so the icon sits centered in the pinned
  // bar -- matching height with #contactHeading, which the bar's
  // now-solid background needs to fully cover -- rather than
  // flush against the very top of it. Subtracting that offset moves
  // the trigger earlier by the same amount, so the live position has
  // already reached exactly that padding's worth of "natural" space
  // above it at the moment it pins, instead of reaching 0 too late.
  markPinScrollY = markNaturalTop + (markIntroHeight - MARK_SETTLED_HEIGHT) / 2 - MARK_PINNED_TOP_OFFSET;

  // Lines up the phone number's own text baseline with the baseline of
  // .blurb's last line opposite it in the other column, by shifting
  // the whole trailing group (#contactSectionHeading, Custos
  // Libri/Bennie Trela, and the email/phone block) up or down as one
  // unit -- applied to contactSectionHeading rather than .contact
  // alone so the spacing *within* the group stays exactly as authored.
  // Measured live (not a hand-picked offset) since both paragraphs'
  // line counts -- and so the natural gap between the two baselines --
  // change with whatever copy ends up in either of them.
  //
  // Only makes sense side by side: below the 760px breakpoint where
  // .details switches to a single stacked column (styles.css), .blurb
  // sits in normal flow far below .contact rather than roughly level
  // with it, so "aligning" their baselines would mean shifting this
  // whole group down by however much of the *entire first column*
  // precedes .blurb on a stacked layout -- hundreds of px of blank
  // space for no visual reason. Skipped entirely there instead.
  contactSectionHeading.style.marginTop = '0px';
  if (window.matchMedia('(min-width: 760px)').matches) {
    contactSectionHeading.style.marginTop = (baselineY(blurb) - baselineY(phoneLink)) + 'px';
  }
}

function update() {
  const y = window.scrollY;

  // contactSectionHeading is always in normal flow (never removed from
  // it, just faded), so its own live distance from the top of the
  // viewport each frame is exactly "how much further until it comes
  // into view" -- reading it fresh every time (rather than relying on
  // a single cached measurement) means this boundary can't go stale if
  // a web font swap reflows the page after load. The trigger point is
  // the vertical middle of the viewport, not the very top: unlike the
  // old fixed-position "Contact" this replaced, this heading is always
  // in normal flow, so there's no requirement that it ever be able to
  // reach the very top of the viewport (which isn't guaranteed on a
  // short page or a tall one -- see the two earlier, now-removed fixes
  // for exactly that class of bug). The midpoint is always reachable
  // by scrolling, on any page/viewport combination, and reads as "as
  // the contact info comes into view" more literally besides.
  const sectionTop = contactSectionHeading.getBoundingClientRect().top;
  const sectionTriggerY = window.innerHeight / 2;

  if (isContactSectionVisible) {
    if (sectionTop > sectionTriggerY + HYSTERESIS) isContactSectionVisible = false;
  } else if (sectionTop <= sectionTriggerY) {
    isContactSectionVisible = true;
  }

  if (isVisible) {
    if (y <= EARLY_THRESHOLD - HYSTERESIS) isVisible = false;
  } else if (y > EARLY_THRESHOLD) {
    isVisible = true;
  }

  // The header-bar Contact link is visible once scrolled past the very
  // top of the page and not yet overlapping #contactSectionHeading,
  // which takes over (crossfading in as this crossfades out) once
  // that's in view -- and reverses on scrolling back up.
  contactFader.setTarget(y > 0 && isVisible && !isContactSectionVisible ? 1 : 0);
  contactSectionFader.setTarget(isContactSectionVisible ? 1 : 0);

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
  // sized the mark for the current scroll position, rather than cached
  // once up front -- the mark's own natural height keeps changing
  // while scrolling, so there's no single natural value to cache ahead
  // of time.
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

const contactFader = createFader(contactHeading);
const contactSectionFader = createFader(contactSectionHeading);

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
