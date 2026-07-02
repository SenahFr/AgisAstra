const fixedNav = document.getElementById('fixedNav');

function updateFixedNav() {
  fixedNav.classList.toggle('is-visible', window.scrollY > 40);
}

updateFixedNav();
window.addEventListener('scroll', updateFixedNav, { passive: true });
