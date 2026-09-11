// ParticleSystem.js
// A small pooled particle system built on THREE.Points so hit effects,
// muzzle flashes, and death bursts don't allocate new geometry every frame.
import * as THREE from 'three';

const MAX_PARTICLES = 400;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;

    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    this.material = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Pool of particle state, parallel to the buffer attributes.
    this.pool = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      vx: 0, vy: 0, vz: 0,
      life: 0, maxLife: 1,
      gravity: 0,
    }));
    this.cursor = 0;
  }

  _spawn(x, y, z, opts = {}) {
    const p = this.pool[this.cursor];
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;

    p.active = true;
    p.life = 0;
    p.maxLife = opts.life ?? 0.5;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.vz = opts.vz ?? 0;
    p.gravity = opts.gravity ?? 0;

    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;

    const [r, g, b] = opts.color ?? [1, 0.6, 0.2];
    this.colors[i * 3] = r;
    this.colors[i * 3 + 1] = g;
    this.colors[i * 3 + 2] = b;

    this.sizes[i] = opts.size ?? 1;
  }

  /** Muzzle flash burst at a world position, oriented outward from `dir`. */
  muzzleFlash(position, dir) {
    for (let i = 0; i < 8; i++) {
      const spread = 0.15;
      this._spawn(position.x, position.y, position.z, {
        vx: dir.x * 4 + (Math.random() - 0.5) * spread,
        vy: dir.y * 4 + (Math.random() - 0.5) * spread,
        vz: dir.z * 4 + (Math.random() - 0.5) * spread,
        life: 0.12 + Math.random() * 0.06,
        color: [1, 0.7 + Math.random() * 0.3, 0.3],
        gravity: 0,
      });
    }
  }

  /** Abstract, non-graphic hit particles (kept stylized rather than gory). */
  hitBurst(position, color = [0.6, 1, 0.7]) {
    for (let i = 0; i < 14; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 1.5 + Math.random() * 2.5;
      this._spawn(position.x, position.y, position.z, {
        vx: Math.sin(phi) * Math.cos(theta) * speed,
        vy: Math.cos(phi) * speed * 0.6 + 1,
        vz: Math.sin(phi) * Math.sin(theta) * speed,
        life: 0.35 + Math.random() * 0.3,
        color,
        gravity: 4,
      });
    }
  }

  explosion(position, color = [1, 0.5, 0.15]) {
    for (let i = 0; i < 40; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 2 + Math.random() * 4;
      this._spawn(position.x, position.y, position.z, {
        vx: Math.sin(phi) * Math.cos(theta) * speed,
        vy: Math.cos(phi) * speed,
        vz: Math.sin(phi) * Math.sin(theta) * speed,
        life: 0.5 + Math.random() * 0.4,
        color,
        gravity: 3,
      });
    }
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.positions[i * 3 + 1] = -9999; // park off-screen
        continue;
      }
      p.vy -= p.gravity * dt;
      this.positions[i * 3] += p.vx * dt;
      this.positions[i * 3 + 1] += p.vy * dt;
      this.positions[i * 3 + 2] += p.vz * dt;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
