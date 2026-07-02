const fixedNav = document.getElementById('fixedNav');
const contactSlot = document.getElementById('contactHeadingSlot');
const contactHeading = document.getElementById('contactHeading');

const EARLY_THRESHOLD = 24; // scroll past this before "Contact" appears pinned
const PIN_TOP = 24; // px from the top of the viewport when pinned/locked

let naturalTop = 0; // document-relative Y of the heading's designed (locked) position

// Measures where the heading naturally sits in the page (forcing it out
// of sticky/fixed positioning briefly so the measurement is accurate
// regardless of its current state) and locks the slot's height so
// removing the heading from flow (when pinned) never shifts the rest
// of the column.
function measure() {
  const wasPinned = contactHeading.classList.contains('is-pinned');
  contactHeading.classList.add('measuring');
  const rect = contactSlot.getBoundingClientRect();
  naturalTop = rect.top + window.scrollY;
  contactSlot.style.height = rect.height + 'px';
  contactHeading.classList.remove('measuring');
  contactHeading.classList.toggle('is-pinned', wasPinned);
}

function update() {
  const y = window.scrollY;
  fixedNav.classList.toggle('is-visible', y > 40);

  // Below this scroll position, native sticky hasn't engaged yet (the
  // heading's natural position is still below the top offset), so we
  // force it fixed at the top-left instead. At and beyond this point,
  // native position: sticky (the element's default state) takes over
  // and holds it in place on its own -- including releasing correctly
  // if the page is scrolled back up past this threshold.
  const lockScrollY = naturalTop - PIN_TOP;
  contactHeading.classList.toggle('is-pinned', y < lockScrollY);

  // Pinned positioning kicks in immediately so there's no layout jump,
  // but it fades in via opacity rather than popping in abruptly.
  contactHeading.classList.toggle('is-visible', y > EARLY_THRESHOLD);
}

measure();
update();

window.addEventListener('scroll', update, { passive: true });
window.addEventListener('resize', () => {
  measure();
  update();
});
