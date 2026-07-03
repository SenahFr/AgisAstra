const contactSlot = document.getElementById('contactHeadingSlot');
const contactHeading = document.getElementById('contactHeading');
const markBarSlot = document.getElementById('markBarSlot');
const markBar = document.getElementById('markBar');

const EARLY_THRESHOLD = 24; // scroll past this before "Contact" appears pinned

let markNaturalTop = 0; // document-relative Y of the logomark's natural (centered) position

// Measures where an element naturally sits in the page (forcing it out
// of its pinned/fixed state briefly so the measurement is accurate
// regardless of current scroll position) and locks its slot's height
// so removing it from flow (when pinned) never shifts surrounding
// content.
function measure(slot, el) {
  const wasPinned = el.classList.contains('is-pinned');
  el.classList.remove('is-pinned');
  const rect = slot.getBoundingClientRect();
  const top = rect.top + window.scrollY;
  slot.style.height = rect.height + 'px';
  el.classList.toggle('is-pinned', wasPinned);
  return top;
}

function measureAll() {
  measure(contactSlot, contactHeading); // just locks the slot height
  markNaturalTop = measure(markBarSlot, markBar);
}

function update() {
  const y = window.scrollY;

  // Contact: pins to the top of the viewport past the early threshold
  // and stays pinned for the rest of the page -- same pure-JS
  // position: fixed pattern as the logomark below, rather than handing
  // off to native position: sticky. Sticky turned out not to engage
  // reliably for this element inside the two-column grid (it kept
  // drifting with scroll instead of clamping to top: 0), which is what
  // caused the jumpiness; a JS scroll-threshold driving position:
  // fixed is deterministic and has no such gap.
  contactHeading.classList.toggle('is-pinned', y > EARLY_THRESHOLD);

  // Pinned positioning kicks in immediately so there's no layout jump,
  // but it fades in via opacity rather than popping in abruptly.
  contactHeading.classList.toggle('is-visible', y > EARLY_THRESHOLD);

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
