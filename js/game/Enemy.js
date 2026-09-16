// Enemy.js — original zombie-like entities built from primitive low-poly
// geometry with a procedural limb rig (no baked mocap, no external models —
// everything here is generated code, animated by simple sine/lerp motion).
// No copyrighted characters, names, or assets are used anywhere here.
import * as THREE from 'three';

export const ENEMY_TYPES = {
  VOID_CRAWLER: {
    id: 'VOID_CRAWLER', label: 'Void Crawler',
    health: 40, walkSpeed: 1.6, runSpeed: 3.6, damage: 8, attackRange: 1.5, attackCooldown: 0.9,
    scoreValue: 100, radius: 0.5, color: 0x2a2a33, coreColor: 0x5cff9a,
  },
  FLESH_WARDEN: {
    id: 'FLESH_WARDEN', label: 'Flesh Warden',
    health: 90, walkSpeed: 1.0, runSpeed: 1.9, damage: 14, attackRange: 12, attackCooldown: 2.0,
    scoreValue: 220, radius: 0.75, color: 0x3a1f22, coreColor: 0xff5c5c, ranged: true,
  },
  ASH_HOUND: {
    id: 'ASH_HOUND', label: 'Ash Hound',
    health: 26, walkSpeed: 2.2, runSpeed: 5.6, damage: 10, attackRange: 1.3, attackCooldown: 0.7,
    scoreValue: 140, radius: 0.42, color: 0x2f271e, coreColor: 0xffb347,
  },
};

let nextId = 1;
const HEAD_DAMAGE_MULT = 2.2;

export class Enemy {
  constructor(typeKey, scene, position) {
    this.id = nextId++;
    this.type = ENEMY_TYPES[typeKey];
    this.health = this.type.health;
    this.maxHealth = this.type.health;
    this.alive = true;
    this.state = 'idle'; // idle | walk | run | attack | stagger | dead
    this.attackTimer = Math.random() * this.type.attackCooldown;
    this.deathT = 0;
    this.staggerT = 0;
    this.animT = Math.random() * 10;
    this.footstepTimer = Math.random() * 0.4;
    this.growlTimer = 2 + Math.random() * 4;
    this.scene = scene;

    this.rig = {};
    this.mesh = this._buildMesh();
    this.mesh.position.copy(position);
    this.mesh.position.y = 0;
    scene.add(this.mesh);
  }

  _bodyHeight() {
    return this.type.id === 'FLESH_WARDEN' ? 2.1 : this.type.id === 'ASH_HOUND' ? 1.0 : 1.3;
  }

  /** Builds a small procedural rig: torso + head (tagged for headshots) + swinging limbs. */
  _buildMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: this.type.color, roughness: 0.75, metalness: 0.2 });
    const coreMat = new THREE.MeshStandardMaterial({ color: this.type.coreColor, emissive: this.type.coreColor, emissiveIntensity: 1.1, roughness: 0.3 });
    const limbMat = new THREE.MeshStandardMaterial({ color: this.type.color, roughness: 0.85, metalness: 0.1 });

    const torso = new THREE.Group();
    const head = new THREE.Group();
    const limbs = [];

    if (this.type.id === 'VOID_CRAWLER') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 1.25), bodyMat);
      torso.add(body);
      torso.position.y = 0.55;

      const headMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), coreMat);
      head.add(headMesh);
      head.position.set(0, 0.42, 0.4);
      torso.add(head);

      for (const side of [-1, 1]) {
        for (const front of [-1, 1]) {
          const leg = new THREE.Group();
          const legMesh = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 4), limbMat);
          legMesh.position.y = -0.27;
          legMesh.rotation.x = Math.PI;
          leg.add(legMesh);
          leg.position.set(side * 0.42, -0.25, front * 0.45);
          torso.add(leg);
          limbs.push({ pivot: leg, phase: (side * front > 0 ? 0 : Math.PI), axis: 'x', amp: 0.5 });
        }
      }
    } else if (this.type.id === 'FLESH_WARDEN') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.68, 1.35, 6), bodyMat);
      torso.add(body);
      torso.position.y = 1.15;

      const headMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), bodyMat);
      const headCore = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), coreMat);
      headCore.position.z = 0.22;
      head.add(headMesh, headCore);
      head.position.y = 0.9;
      torso.add(head);

      const chestCore = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), coreMat);
      chestCore.position.set(0, 0.1, 0.4);
      torso.add(chestCore);

      for (const side of [-1, 1]) {
        const arm = new THREE.Group();
        const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.85, 6), limbMat);
        armMesh.position.y = -0.42;
        arm.add(armMesh);
        arm.position.set(side * 0.6, 0.5, 0);
        torso.add(arm);
        limbs.push({ pivot: arm, phase: side > 0 ? 0 : Math.PI, axis: 'x', amp: 0.35 });
      }
      for (const side of [-1, 1]) {
        const leg = new THREE.Group();
        const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.7, 6), limbMat);
        legMesh.position.y = -0.35;
        leg.add(legMesh);
        leg.position.set(side * 0.28, -0.65, 0);
        torso.add(leg);
        limbs.push({ pivot: leg, phase: side > 0 ? Math.PI : 0, axis: 'x', amp: 0.3 });
      }
    } else {
      // ASH_HOUND — low quadruped-ish sprinter
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.95, 5), bodyMat);
      body.rotation.x = Math.PI / 2;
      torso.add(body);
      torso.position.y = 0.42;

      const headMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), coreMat);
      head.add(headMesh);
      head.position.set(0, 0.02, -0.55);
      torso.add(head);

      for (const side of [-1, 1]) {
        for (const front of [-1, 1]) {
          const leg = new THREE.Group();
          const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 4), limbMat);
          legMesh.position.y = -0.2;
          leg.add(legMesh);
          leg.position.set(side * 0.22, -0.15, front * 0.35);
          torso.add(leg);
          limbs.push({ pivot: leg, phase: (side * front > 0 ? 0 : Math.PI), axis: 'x', amp: 0.7 });
        }
      }
    }

    head.userData.isHead = true;
    group.add(torso);

    group.userData.enemyId = this.id;
    group.traverse((o) => { o.userData.enemyId = this.id; });
    // re-mark the head explicitly (traverse above stamps enemyId on everything, which is what we want for raycasting)
    head.traverse((o) => { o.userData.isHead = true; });

    this.rig = { torso, head, limbs };
    this._core = head;
    return group;
  }

  /** @returns {number} damage multiplier if this specific mesh is the head hitbox */
  static hitMultiplierFor(mesh) {
    let o = mesh;
    while (o) {
      if (o.userData.isHead) return HEAD_DAMAGE_MULT;
      o = o.parent;
    }
    return 1;
  }

  takeDamage(amount, hitMesh, particles, audio) {
    if (!this.alive) return { killed: false, headshot: false };
    const headshot = Enemy.hitMultiplierFor(hitMesh) > 1;
    const finalAmount = amount * (headshot ? HEAD_DAMAGE_MULT : 1);
    this.health -= finalAmount;

    const hitPoint = this.mesh.position.clone().add(new THREE.Vector3(0, this._bodyHeight() * 0.6, 0));
    particles?.hitBurst(hitPoint, headshot ? [1, 0.9, 0.3] : [0.6, 1, 0.7]);
    particles?.bloodMist(hitPoint);
    if (headshot) audio?.headshot(); else audio?.hitEnemy();

    if (this.health <= 0) {
      this.die(particles, audio);
      return { killed: true, headshot };
    }

    // Hit reaction: brief stagger interrupts movement/attack for readability.
    if (this.state !== 'dead') {
      this.state = 'stagger';
      this.staggerT = 0.22;
    }
    return { killed: false, headshot };
  }

  die(particles, audio) {
    this.alive = false;
    this.state = 'dead';
    const c = this.type.coreColor;
    particles?.explosion(
      this.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)),
      [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255]
    );
    audio?.enemyDeath();
  }

  /**
   * @param {number} dt
   * @param {{moveSpeed:number, playAttackPulse:boolean}} anim  driven by EnemyAI: how fast it's currently moving (0 = idle) and whether an attack swing should play
   */
  update(dt, anim = {}) {
    this.animT += dt * (1 + (anim.moveSpeed || 0) * 0.6);

    if (this.staggerT > 0) {
      this.staggerT -= dt;
      if (this.staggerT <= 0 && this.state === 'stagger') this.state = 'idle';
    }

    if (this._core) this._core.rotation.y += dt * 2;

    if (!this.alive) {
      this.deathT += dt;
      const s = Math.max(0, 1 - this.deathT * 1.6);
      this.mesh.scale.set(s, s * 0.6 + 0.4, s); // collapse rather than uniformly vanish
      this.mesh.rotation.z = Math.min(Math.PI / 2, this.deathT * 3);
      this.mesh.position.y = Math.max(0, this.mesh.position.y - dt * 1.2);
      return;
    }

    // Procedural limb swing: amplitude scales with current move speed, and
    // stops cleanly when idle/staggering so the creature reads as alert vs moving.
    const moveSpeed = this.state === 'stagger' || this.state === 'dead' ? 0 : (anim.moveSpeed || 0);
    const swingSpeed = 6 + moveSpeed * 2.2;
    for (const limb of this.rig.limbs || []) {
      const target = moveSpeed > 0.05
        ? Math.sin(this.animT * swingSpeed + limb.phase) * limb.amp * Math.min(1, moveSpeed)
        : Math.sin(this.animT * 1.2 + limb.phase) * 0.03; // idle sway
      limb.pivot.rotation.x = target;
    }

    // idle bob / breathing
    if (this.rig.torso) {
      const idleBob = this.state === 'idle' ? Math.sin(this.animT * 1.6) * 0.02 : 0;
      this.rig.torso.position.y = (this.rig.torso.userData.baseY ??= this.rig.torso.position.y) + idleBob;
    }

    // attack swing: a quick forward lunge of the torso when told to
    if (this.state === 'attack' && anim.playAttackPulse) {
      this.mesh.userData.attackPulseT = 0.18;
    }
    if (this.mesh.userData.attackPulseT > 0) {
      this.mesh.userData.attackPulseT -= dt;
      const t = Math.max(0, this.mesh.userData.attackPulseT) / 0.18;
      this.rig.torso.position.z = Math.sin(t * Math.PI) * 0.18;
    } else if (this.rig.torso) {
      this.rig.torso.position.z = 0;
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
