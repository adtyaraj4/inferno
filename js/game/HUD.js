// HUD.js — thin layer that syncs game state to DOM overlay elements.
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      score: document.getElementById('hudScore'),
      kills: document.getElementById('hudKills'),
      wave: document.getElementById('hudWave'),
      hpFill: document.getElementById('hpFill'),
      armorFill: document.getElementById('armorFill'),
      weaponName: document.getElementById('weaponName'),
      ammo: document.getElementById('hudAmmo'),
      reserve: document.getElementById('hudReserve'),
      vignette: document.getElementById('damageVignette'),
      reloadIndicator: document.getElementById('reloadIndicator'),
      waveBanner: document.getElementById('waveBanner'),
      radar: document.getElementById('hudRadar'),
      hitMarker: document.getElementById('hitMarker'),
      objective: document.getElementById('hudObjective'),
    };
    this._vignetteT = 0;
    this._bannerT = 0;
    this._hitMarkerT = 0;
    this._radarDots = [];
    this._radarRange = 26; // world units shown at the edge of the radar ring
  }

  show() { this.el.hud.hidden = false; }
  hide() { this.el.hud.hidden = true; }

  update({ score, kills, wave, player, weapon }) {
    this.el.score.textContent = Math.round(score).toLocaleString();
    this.el.kills.textContent = kills;
    this.el.wave.textContent = wave;
    this.el.hpFill.style.width = `${Math.max(0, (player.health / player.maxHealth) * 100)}%`;
    this.el.armorFill.style.width = `${Math.max(0, (player.armor / player.maxArmor) * 100)}%`;
    this.el.weaponName.textContent = weapon.def.name;
    this.el.ammo.textContent = weapon.ammo;
    this.el.reserve.textContent = weapon.reserve;
    this.el.reloadIndicator.hidden = !weapon.reloading;
  }

  flashDamage() {
    this._vignetteT = 0.35;
  }

  /** Brief crosshair pulse on a confirmed hit; a larger gold pulse for headshots. */
  flashHitMarker(headshot = false) {
    if (!this.el.hitMarker) return;
    this.el.hitMarker.classList.remove('is-active', 'is-headshot');
    // force reflow so the animation restarts even on rapid-fire hits
    void this.el.hitMarker.offsetWidth;
    this.el.hitMarker.classList.add('is-active');
    if (headshot) this.el.hitMarker.classList.add('is-headshot');
    this._hitMarkerT = 0.22;
  }

  setObjective(text) {
    if (this.el.objective) this.el.objective.textContent = text;
  }

  /** Plots each living enemy as a dot relative to the player's position + facing. */
  updateRadar(enemies, player) {
    const living = enemies.filter((e) => e.alive);
    while (this._radarDots.length < living.length) {
      const dot = document.createElement('div');
      dot.className = 'radar-dot';
      this.el.radar.appendChild(dot);
      this._radarDots.push(dot);
    }
    this._radarDots.forEach((dot, i) => {
      if (i >= living.length) { dot.style.display = 'none'; return; }
      const enemy = living[i];
      const dx = enemy.mesh.position.x - player.position.x;
      const dz = enemy.mesh.position.z - player.position.z;
      // rotate world offset into player-facing space so "up" on the radar is forward
      const cos = Math.cos(-player.yaw), sin = Math.sin(-player.yaw);
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      const clamped = Math.min(1, Math.hypot(rx, rz) / this._radarRange);
      const angle = Math.atan2(rx, -rz);
      const radius = clamped * 46;
      const px = Math.sin(angle) * radius;
      const py = -Math.cos(angle) * radius;
      dot.style.display = 'block';
      dot.style.transform = `translate(${px}px, ${py}px)`;
      dot.style.opacity = enemy.state === 'attack' ? '1' : '0.75';
    });
  }

  showWaveBanner(text) {
    this.el.waveBanner.textContent = text;
    this.el.waveBanner.classList.add('is-visible');
    this._bannerT = 2.2;
  }

  tick(dt) {
    if (this._vignetteT > 0) {
      this._vignetteT -= dt;
      this.el.vignette.classList.add('is-hit');
      if (this._vignetteT <= 0) this.el.vignette.classList.remove('is-hit');
    }
    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) this.el.waveBanner.classList.remove('is-visible');
    }
    if (this._hitMarkerT > 0) {
      this._hitMarkerT -= dt;
      if (this._hitMarkerT <= 0 && this.el.hitMarker) this.el.hitMarker.classList.remove('is-active', 'is-headshot');
    }
  }
}
