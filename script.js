const contactSentinel = document.getElementById('contactSentinel');
const contactEarlyBar = document.getElementById('contactEarlyBar');
const markBarSlot = document.getElementById('markBarSlot');
const markBar = document.getElementById('markBar');

const EARLY_THRESHOLD = 24; // scroll past this before "Contact" appears pinned
const HYSTERESIS = 16; // px of scroll buffer at each boundary before it can flip back

let markNaturalTop = 0; // document-relative Y of the logomark's natural (centered) position

// Latched state, not recomputed from scratch every frame: without a
// buffer, tiny scroll jitter right at a boundary (trackpad momentum,
// rubber-banding) flips a class back and forth many times a second,
// which reads as a flicker even when the two states it's flipping
// between are visually identical.
let showEarlyBar = false;
let isVisible = false;
let markIsPinned = false;

// Measures where the logomark naturally sits in the page (forcing it
// out of its pinned state briefly so the measurement is accurate
// regardless of current scroll position) and locks its slot's height
// so removing it from flow (once pinned) never shifts surrounding
// content.
function measureMark() {
  const prevClasses = [...markBar.classList].filter((c) => c !== 'mark-bar');
  markBar.classList.remove(...prevClasses);
  const rect = markBarSlot.getBoundingClientRect();
  markNaturalTop = rect.top + window.scrollY;
  markBarSlot.style.height = rect.height + 'px';
  markBar.classList.add(...prevClasses);
}

function update() {
  const y = window.scrollY;

  // contactSentinel sits in normal flow immediately before the real
  // (sticky) Contact heading, so its live distance from the top of the
  // viewport each frame is exactly "how much further until the real
  // heading would want to stick" -- reading it fresh every time (rather
  // than caching a single measurement up front) means this can't go
  // stale if a web font swap reflows the page after load.
  const sentinelTop = contactSentinel.getBoundingClientRect().top;

  if (y <= 0) {
    showEarlyBar = false;
  } else if (showEarlyBar) {
    if (sentinelTop < -HYSTERESIS) showEarlyBar = false;
  } else if (sentinelTop > HYSTERESIS) {
    showEarlyBar = true;
  }

  if (isVisible) {
    if (y <= EARLY_THRESHOLD - HYSTERESIS) isVisible = false;
  } else if (y > EARLY_THRESHOLD) {
    isVisible = true;
  }

  contactEarlyBar.classList.toggle('is-visible', showEarlyBar && isVisible);

  // Logomark: pins to the top once scrolling brings its natural
  // (centered-in-header) position within reach of the top, and stays
  // pinned for the rest of the page -- position: fixed isn't bounded
  // by a containing block the way sticky is, so this is simple JS
  // rather than needing sticky's native release/re-engage behavior.
  // Same hysteresis buffer as above, for the same reason.
  if (markIsPinned) {
    if (y < markNaturalTop - HYSTERESIS) markIsPinned = false;
  } else if (y > markNaturalTop) {
    markIsPinned = true;
  }
  markBar.classList.toggle('is-pinned', markIsPinned);
}

measureMark();
update();

window.addEventListener('scroll', update, { passive: true });
window.addEventListener('resize', () => {
  measureMark();
  update();
});
