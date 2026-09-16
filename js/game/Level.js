// Level.js
// Builds an original low-poly facility layout: a central hall with four
// branching corridors and rooms. Exposes axis-aligned box colliders for
// cheap player/enemy collision, plus enemy spawn points and pickup points.
import * as THREE from 'three';

const WALL_H = 4.2;
const WALL_COLOR = 0x2a2731;
const FLOOR_COLOR = 0x26232c;
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
    this.scene.fog = new THREE.FogExp2(0x14111a, 0.006);
    this.scene.background = new THREE.Color(0x14111a);
  }

  _buildLighting() {
    // Flat, non-distance-based fill so nothing in the level ever reads as
    // pure black, regardless of how far it sits from a point light.
    const ambient = new THREE.AmbientLight(0x887d94, 2.15);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xa493ad, 0x332b39, 1.65);
    this.scene.add(hemi);

    // decay: 0 means no physically-based distance falloff, so the light
    // stays readable across an entire room/corridor instead of vanishing
    // a few meters out.
    const key = new THREE.PointLight(0xff8a4c, 4.0, 52, 0);
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
    const mat = new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, WALL_H, z);
    this.group.add(mesh);
  }

  _pillar(x, z) {
    this._addBox({ w: 1, h: WALL_H, d: 1, x, y: WALL_H / 2, z, color: 0x14121a });
    this._addCollider(x, z, 1, 1);
    const light = new THREE.PointLight(0xb52d3f, 2.0, 12, 0);
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

  /* --------------------------------------------------- environmental props */

  _crate(x, z, rotY = 0) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a2f22, roughness: 0.95 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat);
    mesh.position.set(x, 0.45, z);
    mesh.rotation.y = rotY;
    this.group.add(mesh);
    this._addCollider(x, z, 0.85, 0.85);
  }

  _barrel(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a1418, roughness: 0.6, metalness: 0.5 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.95, 10), mat);
    mesh.position.set(x, 0.475, z);
    this.group.add(mesh);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 12), new THREE.MeshStandardMaterial({ color: 0xff7a30, emissive: 0xff7a30, emissiveIntensity: 0.4 }));
    band.rotation.x = Math.PI / 2;
    band.position.set(x, 0.7, z);
    this.group.add(band);
    this._addCollider(x, z, 0.65, 0.65);
  }

  /** A broken/sparking console — pure geometry, no external texture. */
  _terminal(x, z, rotY = 0) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1820, roughness: 0.7, metalness: 0.3 }));
    base.position.set(x, 0.55, z);
    base.rotation.y = rotY;
    this.group.add(base);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshBasicMaterial({ color: 0x2fbcff }));
    screen.position.set(x + Math.sin(rotY) * 0.26, 0.85, z + Math.cos(rotY) * 0.26);
    screen.rotation.y = rotY;
    this.group.add(screen);
    this._flickerScreens = this._flickerScreens || [];
    this._flickerScreens.push(screen.material);
    this._addCollider(x, z, 0.7, 0.5);
  }

  /** Canvas-texture warning placard mounted flush on a wall. */
  _warningSign(x, y, z, rotY, label = 'HAZARD') {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#151016'; ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#ff7a30'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, 244, 116);
    ctx.fillStyle = '#ff7a30';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\u26A0', 128, 46);
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(label, 128, 92);
    const texture = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this.group.add(mesh);
  }

  /** A wall-mounted strip that pulses like an emergency alarm light. */
  _emergencyStrip(x, y, z, rotY) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xff2233, emissive: 0xff2233, emissiveIntensity: 1 })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this.group.add(mesh);
    const light = new THREE.PointLight(0xff2233, 0, 8, 0);
    light.position.set(x, y, z);
    this.group.add(light);
    this.emergencyLights = this.emergencyLights || [];
    this.emergencyLights.push({ mesh, light, phase: Math.random() * 10, active: false, nextToggle: Math.random() * 3 });
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

    // Environmental storytelling: crates, barrels, a broken terminal, signage
    this._crate(-9, -3, 0.3);
    this._crate(-9.6, -2.2, 0.9);
    this._barrel(9, 3);
    this._barrel(9.8, 2.4);
    this._terminal(-1.5, -14.9, 0);
    this._terminal(11, -1.5, -Math.PI / 2);
    this._warningSign(0, 2.4, -15.4, 0, 'CONTAINMENT');
    this._warningSign(-15.4, 2.4, 0, Math.PI / 2, 'RESTRICTED');
    this._warningSign(15.4, 2.4, 0, -Math.PI / 2, 'BIOHAZARD');
    this._emergencyStrip(-8, 3.9, -15.3, 0);
    this._emergencyStrip(8, 3.9, -15.3, 0);
    this._emergencyStrip(-8, 3.9, 15.3, 0);
    this._emergencyStrip(8, 3.9, 15.3, 0);

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
    const roomLight = new THREE.PointLight(0xff8a4c, 3.4, 28, 0);
    roomLight.position.set(rx, 3, rz);
    this.group.add(roomLight);

    // a second light halfway down the corridor so it never goes fully dark
    const corridorLight = new THREE.PointLight(0x9f83b5, 2.6, 24, 0);
    corridorLight.position.set(dirX * (15.5 + corridorLen / 2), 3, dirZ * (15.5 + corridorLen / 2));
    this.group.add(corridorLight);

    // scatter a prop or two inside each room so every destination feels distinct
    const propOffsetX = rx + (dirZ !== 0 ? (Math.random() > 0.5 ? 3 : -3) : (dirX > 0 ? -4 : 4));
    const propOffsetZ = rz + (dirX !== 0 ? (Math.random() > 0.5 ? 3 : -3) : (dirZ > 0 ? -4 : 4));
    if (Math.random() > 0.5) this._crate(propOffsetX, propOffsetZ, Math.random() * Math.PI);
    else this._barrel(propOffsetX, propOffsetZ);
    this._emergencyStrip(rx, WALL_H - 0.3, rz - roomSize / 2 + 0.15, 0);
  }

  _roomWallsWithGap(cx, cz, half, dirX, dirZ, gapWidth) {
    // Build 4 walls of a square room, leaving a gap on the side facing the hall.
    const segs = [
      { x: cx, z: cz - half, w: half * 2, d: 0.6, facing: 'n' },
      { x: cx, z: cz + half, w: half * 2, d: 0.6, facing: 's' },
      { x: cx - half, z: cz, w: 0.6, d: half * 2, facing: 'w' },
      { x: cx + half, z: cz, w: 0.6, d: half * 2, facing: 'e' },
    ];
    // The doorway is on the side facing the corridor/hall.
    // North -> south wall, South -> north wall, East -> west wall, West -> east wall.
    const facingToSkip = dirZ === -1 ? 's' : dirZ === 1 ? 'n' : dirX === 1 ? 'w' : 'e';

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
      this.flickerLight.intensity = 4.0 + Math.sin(elapsed * 7) * 0.16 + (Math.random() < 0.015 ? -0.55 : 0);
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

    // Emergency strips pulse independently, like a facility alarm cycling
    // through zones rather than a single synchronized strobe.
    for (const e of this.emergencyLights || []) {
      e.nextToggle -= dt;
      if (e.nextToggle <= 0) {
        e.active = !e.active;
        e.nextToggle = e.active ? 0.12 + Math.random() * 0.1 : 1.5 + Math.random() * 3;
      }
      const targetIntensity = e.active ? 2.4 : 0;
      e.light.intensity += (targetIntensity - e.light.intensity) * Math.min(1, dt * 20);
      e.mesh.material.emissiveIntensity = e.active ? 1.6 : 0.2;
    }

    // Broken terminal screens flicker like failing CRTs.
    for (const mat of this._flickerScreens || []) {
      if (Math.random() < 0.04) mat.color.setHex(Math.random() < 0.5 ? 0x0a1a22 : 0x2fbcff);
    }
  }

  consumePickup(p, elapsed) {
    p.active = false;
    p.mesh.visible = false;
    p.respawnAt = elapsed + 20;
  }
}
