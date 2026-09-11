// app.js — marketing site entry point
import { initNavigation } from './navigation.js';
import { initRevealOnScroll, initHeroParticles, initTrailerModal } from './animations.js';
import { renderLeaderboardTable } from './leaderboard.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initRevealOnScroll();
  initHeroParticles();
  initTrailerModal();
  renderLeaderboardTable();
});
