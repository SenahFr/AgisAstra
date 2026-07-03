const contactSlot = document.getElementById('contactHeadingSlot');
const contactHeading = document.getElementById('contactHeading');
const markBarSlot = document.getElementById('markBarSlot');
const markBar = document.getElementById('markBar');

const EARLY_THRESHOLD = 24; // scroll past this before "Contact" appears pinned

let naturalTop = 0; // document-relative Y of the Contact heading's designed (locked) position
let markNaturalTop = 0; // document-relative Y of the logomark's natural (centered) position

// Measures where an element naturally sits in the page (forcing it out
// of its pinned/locked/fixed state briefly so the measurement is
// accurate regardless of current scroll position) and locks its
// slot's height so removing it from flow (when pinned) never shifts
// surrounding content. Returns both the natural top and width, since
// position: fixed elements don't inherit width from their parent the
// way normal flow does.
function measure(slot, el) {
  const prevClasses = [...el.classList].filter((c) => c !== 'contact-heading' && c !== 'mark-bar');
  el.classList.remove(...prevClasses);
  const rect = slot.getBoundingClientRect();
  const top = rect.top + window.scrollY;
  const width = rect.width;
  slot.style.height = rect.height + 'px';
  el.classList.add(...prevClasses);
  return { top, width };
}

function measureAll() {
  const contactInfo = measure(contactSlot, contactHeading);
  naturalTop = contactInfo.top;
  contactHeading.style.width = contactInfo.width + 'px';
  markNaturalTop = measure(markBarSlot, markBar).top;
}

function update() {
  const y = window.scrollY;

  // Contact has three phases:
  // 1. y === 0: neither class -- off-screen, not yet relevant.
  // 2. 0 < y < naturalTop: .is-pinned -- a full-width bar positioned
  //    fixed immediately (so there's no layout jump waiting to happen),
  //    but it only starts fading in via opacity once past
  //    EARLY_THRESHOLD (.is-visible) -- these two thresholds are
  //    deliberately different, not the same value: is-pinned needs to
  //    already be true for a few frames before is-visible flips so the
  //    browser has an actual "opacity: 0" frame to transition from. If
  //    both toggle together there's no observable starting state and
  //    the CSS transition never gets a chance to animate.
  // 3. y >= naturalTop: .is-locked -- switches to sitting at its actual
  //    designed spot above "Custos Libri" and stays there (fixed, not
  //    sticky) for the rest of the column.
  // The is-pinned/is-locked handoff is an exact JS comparison against a
  // precisely measured value, so there's no dead zone or drift at that
  // edge -- that mismatch (and sticky's own unreliable engagement in
  // this grid layout) was the cause of the jumpiness.
  const shouldPin = y > 0 && y < naturalTop;
  const shouldLock = y >= naturalTop;

  contactHeading.classList.toggle('is-pinned', shouldPin);
  contactHeading.classList.toggle('is-visible', y > EARLY_THRESHOLD);
  contactHeading.classList.toggle('is-locked', shouldLock);

  // Logomark: pins to the top once scrolling brings its natural
  // (centered-in-header) position within reach of the top, and stays
  // pinned for the rest of the page -- position: fixed isn't bounded
  // by a containing block the way sticky is, so this is simple JS
  // rather than needing sticky's native release/re-engage behavior.
  markBar.classList.toggle('is-pinned', y > markNaturalTop);
}

measureAll();
update();

window.addEventListener('scroll', update, { passive: true });
window.addEventListener('resize', () => {
  measureAll();
  update();
});
