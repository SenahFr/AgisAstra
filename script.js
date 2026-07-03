const contactSlot = document.getElementById('contactHeadingSlot');
const contactHeading = document.getElementById('contactHeading');
const markBarSlot = document.getElementById('markBarSlot');
const markBar = document.getElementById('markBar');

const EARLY_THRESHOLD = 24; // scroll past this before "Contact" appears pinned
const PIN_TOP = 24; // px from the top of the viewport when pinned/locked

let naturalTop = 0; // document-relative Y of the Contact heading's designed (locked) position
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
  naturalTop = measure(contactSlot, contactHeading);
  markNaturalTop = measure(markBarSlot, markBar);
}

function update() {
  const y = window.scrollY;

  // Contact: below this scroll position, native sticky hasn't engaged
  // yet (its natural position is still below the top offset), so we
  // force it fixed at the top-left instead. At and beyond this point,
  // native position: sticky (its default state) takes over and holds
  // it in place on its own -- including releasing correctly if the
  // page is scrolled back up past this threshold.
  const lockScrollY = naturalTop - PIN_TOP;
  contactHeading.classList.toggle('is-pinned', y < lockScrollY);

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
