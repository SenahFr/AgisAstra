const contactSentinel = document.getElementById('contactSentinel');
const contactEarlyBar = document.getElementById('contactEarlyBar');
const markBarSlot = document.getElementById('markBarSlot');
const markBar = document.getElementById('markBar');

const HYSTERESIS = 16; // px of scroll buffer at the mark's pin boundary before it can flip back

let markNaturalTop = 0; // document-relative Y of the logomark's natural (centered) position
let markIsPinned = false;

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

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
  const vh = window.innerHeight;

  // contactSentinel sits in normal flow immediately before the real
  // (sticky) Contact heading, so its live distance from the top of the
  // viewport each frame is exactly "how much further until the real
  // heading would appear/stick" -- reading it fresh every time (rather
  // than caching a single measurement up front) means this can't go
  // stale if a web font swap reflows the page after load.
  const sentinelTop = contactSentinel.getBoundingClientRect().top;

  // contact-early-bar's opacity is the minimum of two independent
  // scroll-distance-driven fades, each guaranteed to finish over a
  // fixed number of scroll pixels rather than a fixed amount of time:
  //   - fadeIn: 0 right at the top of the page, 1 by 100px of scroll.
  //   - fadeOut: 1 while the real heading is still comfortably below
  //     the viewport, ramping to 0 by the time its natural top reaches
  //     the *bottom* of the viewport (sentinelTop === vh) -- i.e. it's
  //     fully hidden before the real heading has a chance to be
  //     visible at all, no matter how fast the scroll is, because it's
  //     a function of position, not of elapsed time.
  const fadeIn = clamp01((y - 10) / 90);
  const fadeOut = clamp01((sentinelTop - vh) / 250);
  const opacity = Math.min(fadeIn, fadeOut);

  contactEarlyBar.style.opacity = opacity;
  contactEarlyBar.style.pointerEvents = opacity > 0.05 ? 'auto' : 'none';

  // Logomark: pins to the top once scrolling brings its natural
  // (centered-in-header) position within reach of the top, and stays
  // pinned for the rest of the page -- position: fixed isn't bounded
  // by a containing block the way sticky is, so this is simple JS
  // rather than needing sticky's native release/re-engage behavior.
  // Hysteresis buffer so scroll jitter right at the boundary can't
  // flip it back and forth.
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
