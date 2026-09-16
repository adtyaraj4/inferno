// Weapon.js — hitscan weapon with ammo/reload, recoil, sway, shell casings,
// and a camera-attached viewmodel.
import * as THREE from 'three';

const WEAPON_DEFS = {
  pulse: {
    name: 'Pulse Rifle', kind: 'pulse', damage: 18, fireRate: 0.11,
    magSize: 24, reserveMax: 96, reloadTime: 1.3, range: 60, spread: 0.012,
    color: 0x7fb3d5, recoilKick: 0.012, recoilKickYaw: 0.004,
  },
  hellfire: {
    name: 'Hellfire Cannon', kind: 'hellfire', damage: 85, fireRate: 0.9,
    magSize: 4, reserveMax: 16, reloadTime: 2.1, range: 45, spread: 0.03,
    color: 0xff7a30, recoilKick: 0.05, recoilKickYaw: 0.012,
  },
  void: {
    name: 'Void Blaster', kind: 'void', damage: 32, fireRate: 0.28,
    magSize: 10, reserveMax: 40, reloadTime: 1.6, range: 55, spread: 0.02,
    color: 0xa15cff, recoilKick: 0.022, recoilKickYaw: 0.007,
  },
};

export class Weapon {
  constructor(camera, particles, audio, defKey = 'pulse') {
    this.camera = camera;
    this.particles = particles;
    this.audio = audio;
    this.setWeapon(defKey);

    this.cooldown = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.bobT = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.kickOffset = 0; // viewmodel kickback (z) on fire

    this._buildViewmodel();
  }

  setWeapon(key) {
    this.def = WEAPON_DEFS[key];
    this.ammo = this.def.magSize;
    this.reserve = this.def.reserveMax;
  }

  _buildViewmodel() {
    this.viewmodel = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22202a, roughness: 0.6, metalness: 0.4 });
    const accentMat = new THREE.MeshStandardMaterial({ color: this.def.color, emissive: this.def.color, emissiveIntensity: 0.6 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.55), bodyMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), accentMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.42);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.1), bodyMat);
    grip.position.set(0, -0.15, 0.12);
    const ejectionPort = new THREE.Object3D();
    ejectionPort.position.set(0.08, 0.02, -0.1);

    this.viewmodel.add(body, barrel, grip);
    this.viewmodel.add(ejectionPort);
    this.ejectionPort = ejectionPort;
    this.viewmodel.position.set(0.28, -0.28, -0.6);
    this.camera.add(this.viewmodel);

    this.muzzleFlashLight = new THREE.PointLight(this.def.color, 0, 4, 2);
    this.muzzleFlashLight.position.set(0, 0.02, -0.55);
    this.viewmodel.add(this.muzzleFlashLight);
    this._flashT = 0;
  }

  get canFire() { return !this.reloading && this.cooldown <= 0 && this.ammo > 0; }
  get needsReload() { return this.ammo === 0 && this.reserve > 0; }

  startReload() {
    if (this.reloading || this.ammo === this.def.magSize || this.reserve === 0) return;
    this.reloading = true;
    this.reloadT = 0;
    this.audio.reload();
  }

  /** Returns a raycaster ready to test against enemy hitboxes, or null if the weapon didn't fire. */
  tryFire(player) {
    if (!this.canFire) {
      if (this.ammo === 0 && !this.reloading) this.startReload();
      return null;
    }
    this.ammo--;
    this.cooldown = this.def.fireRate;
    this.audio.shoot(this.def.kind);
    this._flashT = 0.06;
    this.muzzleFlashLight.intensity = 3.5;
    this.kickOffset = 0.08;

    // recoil: an instant upward + slight sideways kick, recovered gradually in update()
    const kickPitch = this.def.recoilKick * (0.85 + Math.random() * 0.3);
    const kickYaw = this.def.recoilKickYaw * (Math.random() > 0.5 ? 1 : -1);
    this.recoilPitch += kickPitch;
    this.recoilYaw += kickYaw;
    if (player) { player.pitch = Math.min(Math.PI / 2 - 0.05, player.pitch + kickPitch); player.yaw += kickYaw; }

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    dir.x += (Math.random() - 0.5) * this.def.spread;
    dir.y += (Math.random() - 0.5) * this.def.spread;
    dir.normalize();

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);

    const worldMuzzle = new THREE.Vector3();
    this.viewmodel.getWorldPosition(worldMuzzle);
    this.particles.muzzleFlash(worldMuzzle, dir);

    // shell casing ejected sideways from the ejection port
    const worldEject = new THREE.Vector3();
    this.ejectionPort.getWorldPosition(worldEject);
    const sideDir = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.particles.shellCasing(worldEject, sideDir);
    this.audio.shellTink();

    const raycaster = new THREE.Raycaster(origin, dir, 0, this.def.range);
    return { raycaster, damage: this.def.damage };
  }

  /**
   * @param {number} dt
   * @param {boolean} isMoving
   * @param {import('./Player.js').Player} player  used to recover recoil back toward baseline
   * @param {{x:number,y:number}} lookDelta  raw per-frame mouse movement, for weapon sway
   */
  update(dt, isMoving, player, lookDelta) {
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= this.def.reloadTime) {
        const needed = this.def.magSize - this.ammo;
        const take = Math.min(needed, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.reloading = false;
      }
    }

    if (this._flashT > 0) {
      this._flashT -= dt;
      if (this._flashT <= 0) this.muzzleFlashLight.intensity = 0;
    }

    // recoil recovery — pull the camera back down/center gradually
    if (player && (this.recoilPitch > 0.0001 || Math.abs(this.recoilYaw) > 0.0001)) {
      const settlePitch = this.recoilPitch * Math.min(1, dt * 9);
      const settleYaw = this.recoilYaw * Math.min(1, dt * 9);
      player.pitch -= settlePitch;
      player.yaw -= settleYaw;
      this.recoilPitch -= settlePitch;
      this.recoilYaw -= settleYaw;
    }

    // weapon sway: lags slightly behind mouse movement, decays back to center
    if (lookDelta) {
      this.swayX += -lookDelta.x * 0.00035;
      this.swayY += -lookDelta.y * 0.00035;
    }
    this.swayX *= 0.9;
    this.swayY *= 0.9;
    const swayClampX = 0.05, swayClampY = 0.04;
    this.swayX = Math.max(-swayClampX, Math.min(swayClampX, this.swayX));
    this.swayY = Math.max(-swayClampY, Math.min(swayClampY, this.swayY));

    // simple weapon bob while moving
    this.bobT += dt * (isMoving ? 8 : 2);
    const bobAmount = isMoving ? 0.012 : 0.003;

    // reload dip: weapon drops out of frame briefly during reload
    const reloadDip = this.reloading
      ? Math.sin(Math.min(1, this.reloadT / this.def.reloadTime) * Math.PI) * 0.16
      : 0;

    // fire kickback recovery (viewmodel physically jolts back on the z-axis)
    this.kickOffset *= 0.82;

    this.viewmodel.position.y = -0.28 + Math.sin(this.bobT) * bobAmount + this.swayY - reloadDip;
    this.viewmodel.position.x = 0.28 + Math.cos(this.bobT * 0.5) * bobAmount * 0.6 + this.swayX;
    this.viewmodel.position.z = -0.6 + this.kickOffset;
    this.viewmodel.rotation.x = -this.swayY * 1.4;
    this.viewmodel.rotation.y = -this.swayX * 1.4;
  }

  dispose() {
    this.camera.remove(this.viewmodel);
    this.viewmodel.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}

export { WEAPON_DEFS };
