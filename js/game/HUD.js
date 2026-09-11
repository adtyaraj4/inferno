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
    };
    this._vignetteT = 0;
    this._bannerT = 0;
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
  }
}
