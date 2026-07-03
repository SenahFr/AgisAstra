const contactHeadingSlot = document.getElementById('contactHeadingSlot');
const contactSentinel = document.getElementById('contactSentinel');
const contactHeading = document.getElementById('contactHeading');
const markBarSlot = document.getElementById('markBarSlot');
const markBar = document.getElementById('markBar');

const EARLY_THRESHOLD = 24; // scroll past this before "Contact" appears pinned
const HYSTERESIS = 16; // px of scroll buffer at each boundary before it can flip back

let markNaturalTop = 0; // document-relative Y of the logomark's natural (centered) position

// Latched state, not recomputed from scratch every frame: without a
// buffer, tiny scroll jitter right at a boundary (trackpad momentum,
// rubber-banding) flips a class back and forth many times a second --
// each flip is a real layout change (is-pinned/is-locked render at
// different offsets), so that showed up as a visible flicker/jump.
let isLocked = false;
let isVisible = false;
let markIsPinned = false;

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
  contactHeading.style.width = rect.width + 'px';
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
  contactHeading.classList.toggle('is-visible', isVisible && shouldPin);
  contactHeading.classList.toggle('is-locked', isLocked);

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
