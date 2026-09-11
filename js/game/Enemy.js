// Enemy.js — original enemy types built from primitive low-poly geometry.
// No copyrighted characters, names, or assets are used anywhere here.
import * as THREE from 'three';

export const ENEMY_TYPES = {
  VOID_CRAWLER: {
    id: 'VOID_CRAWLER', label: 'Void Crawler',
    health: 40, speed: 3.4, damage: 8, attackRange: 1.4, attackCooldown: 0.9,
    scoreValue: 100, radius: 0.5, color: 0x2a2a33, coreColor: 0x5cff9a,
  },
  FLESH_WARDEN: {
    id: 'FLESH_WARDEN', label: 'Flesh Warden',
    health: 90, speed: 1.7, damage: 14, attackRange: 12, attackCooldown: 2.0,
    scoreValue: 220, radius: 0.75, color: 0x3a1f22, coreColor: 0xff5c5c, ranged: true,
  },
  ASH_HOUND: {
    id: 'ASH_HOUND', label: 'Ash Hound',
    health: 26, speed: 5.2, damage: 10, attackRange: 1.2, attackCooldown: 0.7,
    scoreValue: 140, radius: 0.42, color: 0x2f271e, coreColor: 0xffb347,
  },
};

let nextId = 1;

export class Enemy {
  constructor(typeKey, scene, position) {
    this.id = nextId++;
    this.type = ENEMY_TYPES[typeKey];
    this.health = this.type.health;
    this.maxHealth = this.type.health;
    this.alive = true;
    this.state = 'idle'; // idle | chase | attack | dead
    this.attackTimer = Math.random() * this.type.attackCooldown;
    this.deathT = 0;
    this.scene = scene;

    this.mesh = this._buildMesh();
    this.mesh.position.copy(position);
    this.mesh.position.y = this._bodyHeight() / 2;
    scene.add(this.mesh);
  }

  _bodyHeight() {
    return this.type.id === 'FLESH_WARDEN' ? 2.1 : this.type.id === 'ASH_HOUND' ? 1.0 : 1.3;
  }

  _buildMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: this.type.color, roughness: 0.7, metalness: 0.2 });
    const coreMat = new THREE.MeshStandardMaterial({ color: this.type.coreColor, emissive: this.type.coreColor, emissiveIntensity: 1.1, roughness: 0.3 });

    if (this.type.id === 'VOID_CRAWLER') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.3), bodyMat);
      body.position.y = 0.3;
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), coreMat);
      core.position.y = 0.55;
      group.add(body, core);
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), bodyMat);
        leg.position.set(side * 0.4, 0.0, 0.3);
        leg.rotation.x = Math.PI;
        group.add(leg);
      }
      this._core = core;
    } else if (this.type.id === 'FLESH_WARDEN') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.6, 6), bodyMat);
      body.position.y = 0.9;
      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), bodyMat);
      head.position.y = 1.9;
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), coreMat);
      core.position.y = 1.0;
      group.add(body, head, core);
      this._core = core;
    } else {
      // ASH_HOUND
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 5), bodyMat);
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.4;
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), coreMat);
      core.position.set(0, 0.4, -0.45);
      group.add(body, core);
      this._core = core;
    }

    group.userData.enemyId = this.id;
    group.traverse((o) => { o.userData.enemyId = this.id; });
    return group;
  }

  takeDamage(amount, particles, audio) {
    if (!this.alive) return false;
    this.health -= amount;
    particles?.hitBurst(this.mesh.position.clone().add(new THREE.Vector3(0, this._bodyHeight() * 0.5, 0)), [0.6, 1, 0.7]);
    audio?.hitEnemy();
    if (this.health <= 0) {
      this.die(particles, audio);
      return true;
    }
    return false;
  }

  die(particles, audio) {
    this.alive = false;
    this.state = 'dead';
    particles?.explosion(this.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)), [this.type.coreColor >> 16 & 255, this.type.coreColor >> 8 & 255, this.type.coreColor & 255].map((c) => c / 255));
    audio?.enemyDeath();
  }

  update(dt) {
    if (this._core) this._core.rotation.y += dt * 2;
    if (!this.alive) {
      this.deathT += dt;
      const s = Math.max(0, 1 - this.deathT * 1.6);
      this.mesh.scale.setScalar(s);
      this.mesh.position.y -= dt * 0.4;
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
