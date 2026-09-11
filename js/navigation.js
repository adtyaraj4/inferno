// navigation.js — sticky nav scroll state, mobile menu, sound toggle
import { isSoundEnabled, setSoundEnabled } from './leaderboard.js';

export function initNavigation() {
  const nav = document.getElementById('siteNav');
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  const soundToggle = document.getElementById('soundToggle');
  const soundOnIcon = document.getElementById('soundOnIcon');
  const soundOffIcon = document.getElementById('soundOffIcon');

  // Sticky nav background on scroll
  const onScroll = () => {
    if (window.scrollY > 24) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile hamburger menu
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('is-open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
      hamburger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });

    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('is-open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Sound toggle (persisted via leaderboard.js shared storage helpers)
  if (soundToggle) {
    const reflect = (enabled) => {
      soundToggle.setAttribute('aria-pressed', String(enabled));
      if (soundOnIcon && soundOffIcon) {
        soundOnIcon.hidden = !enabled;
        soundOffIcon.hidden = enabled;
      }
    };
    reflect(isSoundEnabled());
    soundToggle.addEventListener('click', () => {
      const next = !isSoundEnabled();
      setSoundEnabled(next);
      reflect(next);
    });
  }
}
