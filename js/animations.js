// animations.js — scroll reveals + lightweight hero background particles
// (Canvas 2D, not Three.js — kept cheap since it runs behind marketing copy.)

export function initRevealOnScroll() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  items.forEach((el) => observer.observe(el));
}

export function initHeroParticles() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width, height, dpr;
  let particles = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth = canvas.parentElement.clientWidth;
    height = canvas.clientHeight = canvas.parentElement.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeParticle() {
    return {
      x: Math.random() * width,
      y: height + Math.random() * 100,
      r: 1 + Math.random() * 2.2,
      speed: 0.25 + Math.random() * 0.6,
      drift: (Math.random() - 0.5) * 0.3,
      alpha: 0.15 + Math.random() * 0.5,
      hue: Math.random() > 0.5 ? '255,122,48' : '217,43,60',
    };
  }

  function init() {
    resize();
    const count = Math.min(70, Math.floor((width * height) / 18000));
    particles = Array.from({ length: count }, makeParticle);
  }

  function drawStatic() {
    // Reduced-motion fallback: a single quiet gradient frame, no RAF loop.
    ctx.clearRect(0, 0, width, height);
    const g = ctx.createRadialGradient(width / 2, height * 0.35, 0, width / 2, height * 0.35, height * 0.8);
    g.addColorStop(0, 'rgba(255,122,48,0.10)');
    g.addColorStop(1, 'rgba(8,7,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  let raf;
  function tick() {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.y -= p.speed;
      p.x += p.drift;
      if (p.y < -10) Object.assign(p, makeParticle(), { y: height + 10 });
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.hue},${p.alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  }

  init();
  if (reduceMotion) {
    drawStatic();
  } else {
    tick();
  }

  window.addEventListener('resize', () => {
    resize();
    if (reduceMotion) drawStatic();
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); }
    else if (!reduceMotion) { tick(); }
  });
}

