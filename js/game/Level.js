// Level.js
// Builds an original low-poly facility layout: a central hall with four
// branching corridors and rooms. Exposes axis-aligned box colliders for
// cheap player/enemy collision, plus enemy spawn points and pickup points.
import * as THREE from 'three';

const WALL_H = 4.2;
const WALL_COLOR = 0x1c1a22;
const FLOOR_COLOR = 0x100e14;
const TRIM_COLOR = 0xff7a30;

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // { minX, maxX, minZ, maxZ }
    this.spawnPoints = [];
    this.pickupPoints = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    this._buildLighting();
    this._buildLayout();
    this._buildFog();
  }

  _buildFog() {
    this.scene.fog = new THREE.FogExp2(0x050408, 0.045);
    this.scene.background = new THREE.Color(0x050408);
  }

  _buildLighting() {
    const hemi = new THREE.HemisphereLight(0x554455, 0x0a0a0f, 0.55);
    this.scene.add(hemi);

    const key = new THREE.PointLight(0xff7a30, 1.6, 30, 2);
    key.position.set(0, 3.4, 0);
    this.scene.add(key);
    this.flickerLight = key;
    this._flickerT = 0;
  }

  _addBox({ w, h, d, x, y, z, color, emissive = 0x000000, emissiveIntensity = 0 }) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.15, emissive, emissiveIntensity });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    return mesh;
  }

  _addCollider(x, z, w, d) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  _wallSegment(x, z, w, d) {
    this._addBox({ w, h: WALL_H, d, x, y: WALL_H / 2, z, color: WALL_COLOR });
    this._addCollider(x, z, w, d);
    // thin trim light strip near the base for readability
    this._addBox({ w: w * 0.9, h: 0.05, d: d * 0.9 + 0.02, x, y: 0.35, z, color: TRIM_COLOR, emissive: TRIM_COLOR, emissiveIntensity: 0.6 });
  }

  _floorPatch(x, z, w, d) {
    const geo = new THREE.PlaneGeometry(w, d);
    const mat = new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0, z);
    this.group.add(mesh);
  }

  _ceilingPatch(x, z, w, d) {
    const geo = new THREE.PlaneGeometry(w, d);
    const mat = new THREE.MeshStandardMaterial({ color: 0x08070a, roughness: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, WALL_H, z);
    this.group.add(mesh);
  }

  _pillar(x, z) {
    this._addBox({ w: 1, h: WALL_H, d: 1, x, y: WALL_H / 2, z, color: 0x14121a });
    this._addCollider(x, z, 1, 1);
    const light = new THREE.PointLight(0x9c1f2e, 0.8, 6, 2);
    light.position.set(x, 2.6, z);
    this.group.add(light);
  }

  _pickupMarker(x, z, kind) {
    const color = kind === 'health' ? 0x5cff9a : 0x5ca7ff;
    const geo = new THREE.OctahedronGeometry(0.32, 0);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1.0, z);
    this.group.add(mesh);
    this.pickupPoints.push({ x, z, kind, mesh, active: true, respawnAt: 0 });
  }

  _buildLayout() {
    // Central hall (30x30), four corridors extending N/S/E/W into rooms.
    this._floorPatch(0, 0, 34, 34);
    this._ceilingPatch(0, 0, 34, 34);

    // Outer hall walls with corridor gaps
    this._wallSegment(-15.5, -9, 1, 16);
    this._wallSegment(-15.5, 9, 1, 16);
    this._wallSegment(15.5, -9, 1, 16);
    this._wallSegment(15.5, 9, 1, 16);
    this._wallSegment(-9, -15.5, 16, 1);
    this._wallSegment(9, -15.5, 16, 1);
    this._wallSegment(-9, 15.5, 16, 1);
    this._wallSegment(9, 15.5, 16, 1);

    // Central pillars for cover
    this._pillar(-4, -4);
    this._pillar(4, -4);
    this._pillar(-4, 4);
    this._pillar(4, 4);

    // Four corridors leading to rooms
    this._buildCorridorRoom(0, -1, 'north');
    this._buildCorridorRoom(0, 1, 'south');
    this._buildCorridorRoom(1, 0, 'east');
    this._buildCorridorRoom(-1, 0, 'west');

    // Pickups scattered through the hall and rooms
    this._pickupMarker(-6, 0, 'health');
    this._pickupMarker(6, 0, 'ammo');
    this._pickupMarker(0, -22, 'ammo');
    this._pickupMarker(0, 22, 'health');
    this._pickupMarker(22, 0, 'health');
    this._pickupMarker(-22, 0, 'ammo');

    // Enemy spawn points: corridors + room interiors, away from hall center
    this.spawnPoints = [
      { x: 0, z: -24 }, { x: 0, z: 24 },
      { x: 24, z: 0 }, { x: -24, z: 0 },
      { x: 6, z: -18 }, { x: -6, z: 18 },
      { x: 18, z: 6 }, { x: -18, z: -6 },
    ];
  }

  _buildCorridorRoom(dirX, dirZ, name) {
    const corridorLen = 10;
    const corridorW = 4;
    const cx = dirX * (15.5 + corridorLen / 2);
    const cz = dirZ * (15.5 + corridorLen / 2);

    const w = dirX !== 0 ? corridorLen : corridorW;
    const d = dirZ !== 0 ? corridorLen : corridorW;
    this._floorPatch(cx, cz, w + 1, d + 1);
    this._ceilingPatch(cx, cz, w + 1, d + 1);

    // corridor side walls
    if (dirX !== 0) {
      this._wallSegment(cx, cz - corridorW / 2, corridorLen, 0.6);
      this._wallSegment(cx, cz + corridorW / 2, corridorLen, 0.6);
    } else {
      this._wallSegment(cx - corridorW / 2, cz, 0.6, corridorLen);
      this._wallSegment(cx + corridorW / 2, cz, 0.6, corridorLen);
    }

    // room at the end of the corridor
    const roomSize = 14;
    const rx = dirX * (15.5 + corridorLen + roomSize / 2);
    const rz = dirZ * (15.5 + corridorLen + roomSize / 2);
    this._floorPatch(rx, rz, roomSize, roomSize);
    this._ceilingPatch(rx, rz, roomSize, roomSize);

    const half = roomSize / 2;
    const gapCenter = dirX !== 0 ? rz : rx; // where the corridor opening is
    this._roomWallsWithGap(rx, rz, half, dirX, dirZ, corridorW);

    // an accent light in each room, distinct per direction for orientation
    const roomLight = new THREE.PointLight(0xff7a30, 1.1, 14, 2);
    roomLight.position.set(rx, 3, rz);
    this.group.add(roomLight);
  }

  _roomWallsWithGap(cx, cz, half, dirX, dirZ, gapWidth) {
    // Build 4 walls of a square room, leaving a gap on the side facing the hall.
    const segs = [
      { x: cx, z: cz - half, w: half * 2, d: 0.6, facing: 'n' },
      { x: cx, z: cz + half, w: half * 2, d: 0.6, facing: 's' },
      { x: cx - half, z: cz, w: 0.6, d: half * 2, facing: 'w' },
      { x: cx + half, z: cz, w: 0.6, d: half * 2, facing: 'e' },
    ];
    const facingToSkip = dirZ === -1 ? 'n' : dirZ === 1 ? 's' : dirX === 1 ? 'e' : 'w';

    for (const seg of segs) {
      if (seg.facing === facingToSkip) {
        // split wall into two segments with a gap in the middle for the doorway
        if (seg.facing === 'n' || seg.facing === 's') {
          const partW = (seg.w - gapWidth) / 2;
          this._wallSegment(seg.x - seg.w / 2 + partW / 2, seg.z, partW, seg.d);
          this._wallSegment(seg.x + seg.w / 2 - partW / 2, seg.z, partW, seg.d);
        } else {
          const partD = (seg.d - gapWidth) / 2;
          this._wallSegment(seg.x, seg.z - seg.d / 2 + partD / 2, seg.w, partD);
          this._wallSegment(seg.x, seg.z + seg.d / 2 - partD / 2, seg.w, partD);
        }
      } else {
        this._wallSegment(seg.x, seg.z, seg.w, seg.d);
      }
    }
  }

  /** Resolve a moving circle (player/enemy) against wall colliders. Mutates pos {x,z}. */
  resolveCollision(pos, radius) {
    for (const c of this.colliders) {
      const closestX = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const closestZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        pos.x += (dx / dist) * overlap;
        pos.z += (dz / dist) * overlap;
      } else if (distSq <= 1e-6) {
        // center exactly on the box edge/corner — push out along shortest axis
        pos.x += radius;
      }
    }
    // world bounds safety net
    const B = 33;
    pos.x = Math.max(-B, Math.min(B, pos.x));
    pos.z = Math.max(-B, Math.min(B, pos.z));
  }

  update(dt, elapsed) {
    this._flickerT += dt;
    if (this.flickerLight) {
      this.flickerLight.intensity = 1.5 + Math.sin(elapsed * 7) * 0.08 + (Math.random() < 0.02 ? -0.6 : 0);
    }
    for (const p of this.pickupPoints) {
      if (p.active) {
        p.mesh.rotation.y += dt * 1.4;
        p.mesh.position.y = 1.0 + Math.sin(elapsed * 2 + p.x) * 0.08;
      } else if (elapsed >= p.respawnAt) {
        p.active = true;
        p.mesh.visible = true;
      }
    }
  }

  consumePickup(p, elapsed) {
    p.active = false;
    p.mesh.visible = false;
    p.respawnAt = elapsed + 20;
  }
}
