const fixedNav = document.getElementById('fixedNav');
const fixedNavContact = document.getElementById('fixedNavContact');
const contactHeading = document.querySelector('.contact-heading');

const EARLY_THRESHOLD = 40; // roughly "right after the hero starts leaving"
const HANDOFF_TOLERANCE = 48; // hide the echo once the real heading is this close to the top

function updateScrollState() {
  const y = window.scrollY;
  fixedNav.classList.toggle('is-visible', y > EARLY_THRESHOLD);

  // Show the fixed "Contact" echo only until the real heading below has
  // scrolled up close enough to the top to take over as the sticky
  // element itself -- measured live so it self-corrects regardless of
  // how much scrollable room is left on the page.
  const realTop = contactHeading.getBoundingClientRect().top;
  const showEcho = y > EARLY_THRESHOLD && realTop > HANDOFF_TOLERANCE;
  fixedNavContact.classList.toggle('is-visible', showEcho);
}

updateScrollState();
window.addEventListener('scroll', updateScrollState, { passive: true });
window.addEventListener('resize', updateScrollState);
