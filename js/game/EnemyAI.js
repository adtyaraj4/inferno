// EnemyAI.js — deterministic grid navigation + collision-safe movement.
// Enemies use the same walkable map topology regardless of line of sight, so
// they can leave corridors/rooms and reliably reach the player's area.
import * as THREE from 'three';

const DETECT_RANGE = 120;
const LOSE_RANGE = 150;
const RUN_RANGE = 10;
const REPATH_INTERVAL = 0.16;
const WAYPOINT_REACH = 0.8;
const STUCK_REPATH = 0.8;
const STUCK_HARD = 2.2;
const GRID_CELL = 1.0;
const GRID_MIN = -32;
const GRID_MAX = 32;
const GRID_SIZE = Math.floor((GRID_MAX - GRID_MIN) / GRID_CELL) + 1;

const _toPlayer = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _candidate = new THREE.Vector3();
const _tmpPos = { x: 0, z: 0 };

function isBlocked(level, x, z, radius) {
  for (const c of level.colliders) {
    const closestX = Math.max(c.minX, Math.min(x, c.maxX));
    const closestZ = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

function clampGrid(v) {
  const i = Math.round((v - GRID_MIN) / GRID_CELL);
  return Math.max(0, Math.min(GRID_SIZE - 1, i));
}

function worldToCell(x, z) {
  return { x: clampGrid(x), z: clampGrid(z) };
}

function cellToWorld(cx, cz) {
  return {
    x: GRID_MIN + cx * GRID_CELL,
    z: GRID_MIN + cz * GRID_CELL,
  };
}

function cellKey(x, z) {
  return z * GRID_SIZE + x;
}

function nearestWalkable(level, cell, radius, maxRadius = 8) {
  const base = cellToWorld(cell.x, cell.z);
  if (!isBlocked(level, base.x, base.z, radius)) return cell;

  let best = null;
  let bestD2 = Infinity;
  for (let ring = 1; ring <= maxRadius; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = Math.max(0, Math.min(GRID_SIZE - 1, cell.x + dx));
        const z = Math.max(0, Math.min(GRID_SIZE - 1, cell.z + dz));
        const p = cellToWorld(x, z);
        if (isBlocked(level, p.x, p.z, radius)) continue;
        const ddx = p.x - base.x;
        const ddz = p.z - base.z;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { x, z };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

class GridNavigator {
  constructor(level) {
    this.level = level;
    this.walkable = new Uint8Array(GRID_SIZE * GRID_SIZE);
    this._build();
  }

  _build() {
    // Build for the largest normal enemy so paths leave enough clearance.
    const radius = 0.82;
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const p = cellToWorld(x, z);
        this.walkable[cellKey(x, z)] = isBlocked(this.level, p.x, p.z, radius) ? 0 : 1;
      }
    }
  }

  _valid(x, z) {
    return x >= 0 && z >= 0 && x < GRID_SIZE && z < GRID_SIZE && this.walkable[cellKey(x, z)] === 1;
  }

  findPath(startWorld, goalWorld, radius) {
    // Use a slightly tighter map for small enemies but never allow a cell that
    // cannot fit the actual enemy.
    const startRaw = worldToCell(startWorld.x, startWorld.z);
    const goalRaw = worldToCell(goalWorld.x, goalWorld.z);
    const start = nearestWalkable(this.level, startRaw, radius);
    const goal = nearestWalkable(this.level, goalRaw, radius);
    if (!start || !goal) return [];

    const startKey = cellKey(start.x, start.z);
    const goalKey = cellKey(goal.x, goal.z);
    if (startKey === goalKey) return [];

    const cameFrom = new Int32Array(GRID_SIZE * GRID_SIZE);
    cameFrom.fill(-1);
    const gScore = new Float32Array(GRID_SIZE * GRID_SIZE);
    const fScore = new Float32Array(GRID_SIZE * GRID_SIZE);
    gScore.fill(Infinity);
    fScore.fill(Infinity);

    // Small binary heap, local to this path search.
    const open = [];
    const push = (key, f) => {
      let i = open.length;
      open.push({ key, f });
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (open[p].f <= f) break;
        open[i] = open[p];
        i = p;
      }
      open[i] = { key, f };
    };
    const pop = () => {
      const first = open[0];
      const last = open.pop();
      if (open.length && last) {
        let i = 0;
        while (true) {
          let child = i * 2 + 1;
          if (child >= open.length) break;
          if (child + 1 < open.length && open[child + 1].f < open[child].f) child++;
          if (open[child].f >= last.f) break;
          open[i] = open[child];
          i = child;
        }
        open[i] = last;
      }
      return first;
    };

    const h = (x, z) => Math.hypot(x - goal.x, z - goal.z);
    gScore[startKey] = 0;
    fScore[startKey] = h(start.x, start.z);
    push(startKey, fScore[startKey]);

    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];

    let guard = 0;
    while (open.length && guard++ < 12000) {
      const current = pop();
      const currentKey = current.key;
      if (currentKey === goalKey) break;
      const cx = currentKey % GRID_SIZE;
      const cz = Math.floor(currentKey / GRID_SIZE);

      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!this._valid(nx, nz)) continue;
        // Never cut diagonally through a wall corner.
        if (dx !== 0 && dz !== 0 && (!this._valid(cx + dx, cz) || !this._valid(cx, cz + dz))) continue;

        const np = cellToWorld(nx, nz);
        if (isBlocked(this.level, np.x, np.z, radius)) continue;
        const nk = cellKey(nx, nz);
        const tentative = gScore[currentKey] + cost;
        if (tentative >= gScore[nk]) continue;
        cameFrom[nk] = currentKey;
        gScore[nk] = tentative;
        fScore[nk] = tentative + h(nx, nz);
        push(nk, fScore[nk]);
      }
    }

    if (cameFrom[goalKey] < 0) return [];

    const cells = [];
    let k = goalKey;
    while (k !== startKey && k >= 0) {
      const x = k % GRID_SIZE;
      const z = Math.floor(k / GRID_SIZE);
      cells.push(cellToWorld(x, z));
      k = cameFrom[k];
    }
    cells.reverse();

    // Compress nearly-collinear cells into longer waypoints.
    const path = [];
    let prevDirX = 0;
    let prevDirZ = 0;
    let last = cellToWorld(start.x, start.z);
    for (const p of cells) {
      const dx = Math.sign(p.x - last.x);
      const dz = Math.sign(p.z - last.z);
      if (path.length && (dx !== prevDirX || dz !== prevDirZ)) path[path.length - 1] = { x: last.x, z: last.z };
      path.push({ x: p.x, z: p.z });
      prevDirX = dx;
      prevDirZ = dz;
      last = p;
    }

    // Remove path points that are immediately reachable in a straight line.
    const smoothed = [];
    let anchor = { x: startWorld.x, z: startWorld.z };
    let i = 0;
    while (i < path.length) {
      let far = i;
      for (let j = path.length - 1; j > i; j--) {
        if (!this._segmentBlocked(anchor, path[j], radius)) {
          far = j;
          break;
        }
      }
      smoothed.push(path[far]);
      anchor = path[far];
      i = far + 1;
    }
    return smoothed;
  }

  _segmentBlocked(a, b, radius) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.45));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      if (isBlocked(this.level, x, z, radius)) return true;
    }
    return false;
  }
}

function getNavigator(level) {
  if (!level._enemyNavigator) level._enemyNavigator = new GridNavigator(level);
  return level._enemyNavigator;
}

function moveWithCollision(level, enemy, dx, dz) {
  const radius = enemy.type.radius;
  const pos = enemy.mesh.position;
  const startX = pos.x;
  const startZ = pos.z;

  const tryMove = (mx, mz) => {
    const nextX = pos.x + mx;
    const nextZ = pos.z + mz;
    if (isBlocked(level, nextX, nextZ, radius)) return false;
    pos.x = nextX;
    pos.z = nextZ;
    return true;
  };

  let moved = tryMove(dx, dz);
  if (!moved) {
    // Axis-separated sliding. Try the larger component first so corners do
    // not cancel the entire movement vector.
    if (Math.abs(dx) >= Math.abs(dz)) {
      moved = tryMove(dx, 0) || tryMove(0, dz);
    } else {
      moved = tryMove(0, dz) || tryMove(dx, 0);
    }
  }

  // A few tiny steering probes make the collision response resilient when a
  // waypoint is pressed directly into a corner between two AABB colliders.
  if (!moved) {
    const len = Math.hypot(dx, dz);
    if (len > 0.00001) {
      const sx = dx / len;
      const sz = dz / len;
      const probe = len * 0.9;
      const angles = [0.45, -0.45, 0.9, -0.9, 1.35, -1.35];
      for (const a of angles) {
        const c = Math.cos(a), ss = Math.sin(a);
        const px = (sx * c - sz * ss) * probe;
        const pz = (sx * ss + sz * c) * probe;
        if (tryMove(px, pz)) { moved = true; break; }
      }
    }
  }

  const safe = { x: pos.x, z: pos.z };
  level.resolveCollision(safe, radius);
  pos.x = safe.x;
  pos.z = safe.z;

  return moved || Math.hypot(pos.x - startX, pos.z - startZ) > 0.002;
}

export function updateEnemyAI(enemy, player, level, dt, onAttackPlayer, audio) {
  if (!enemy.alive) return;

  _toPlayer.set(
    player.position.x - enemy.mesh.position.x,
    0,
    player.position.z - enemy.mesh.position.z
  );
  const dist = _toPlayer.length();
  enemy._repathT = (enemy._repathT ?? 0) - dt;
  enemy._stuckT = enemy._stuckT ?? 0;
  enemy._idleWatchT = enemy._idleWatchT ?? 0;
  enemy._lastX = enemy._lastX ?? enemy.mesh.position.x;
  enemy._lastZ = enemy._lastZ ?? enemy.mesh.position.z;

  // Hostiles are globally aware inside the facility. A radar contact must not
  // remain permanently idle just because it is behind a wall.
  if ((enemy.state === 'idle' || enemy.state === 'stagger') && dist <= DETECT_RANGE) {
    if (enemy.state === 'idle') audio?.growl(0.8);
    enemy.state = 'walk';
    enemy._repathT = 0;
    enemy._stuckT = 0;
  }

  if (enemy.state === 'walk' || enemy.state === 'run') {
    if (dist <= enemy.type.attackRange) {
      enemy.state = 'attack';
    } else {
      enemy.state = dist < RUN_RANGE ? 'run' : 'walk';
      const speed = enemy.state === 'run' ? enemy.type.runSpeed : enemy.type.walkSpeed;
      const navigator = getNavigator(level);

      // Repath frequently enough to follow a moving player, but only when the
      // route is actually consumed/expired.
      if (enemy._repathT <= 0 || !enemy._path || enemy._pathIndex >= enemy._path.length) {
        enemy._path = navigator.findPath(enemy.mesh.position, player.position, enemy.type.radius);
        enemy._pathIndex = 0;
        enemy._repathT = REPATH_INTERVAL;
      }

      let target = player.position;
      if (enemy._path?.length && enemy._pathIndex < enemy._path.length) {
        target = enemy._path[enemy._pathIndex];
        const wx = target.x - enemy.mesh.position.x;
        const wz = target.z - enemy.mesh.position.z;
        if (wx * wx + wz * wz <= WAYPOINT_REACH * WAYPOINT_REACH) {
          enemy._pathIndex++;
          target = enemy._path[enemy._pathIndex] || player.position;
        }
      }

      _dir.set(target.x - enemy.mesh.position.x, 0, target.z - enemy.mesh.position.z);
      if (_dir.lengthSq() < 0.0001) _dir.copy(_toPlayer);
      if (_dir.lengthSq() > 0.0001) _dir.normalize();

      const beforeX = enemy.mesh.position.x;
      const beforeZ = enemy.mesh.position.z;
      const moved = moveWithCollision(level, enemy, _dir.x * speed * dt, _dir.z * speed * dt);
      const actualMoved = Math.hypot(enemy.mesh.position.x - beforeX, enemy.mesh.position.z - beforeZ);

      if (moved && actualMoved > 0.002) {
        enemy._stuckT = 0;
      } else {
        enemy._stuckT += dt;
      }

      // Hard stuck protection: discard the route and immediately probe toward
      // the player from several directions. This prevents the old "frozen at
      // a corner" dead-end even if the A* route and collision geometry disagree.
      if (enemy._stuckT >= STUCK_REPATH) {
        enemy._path = null;
        enemy._pathIndex = 0;
        enemy._repathT = 0;

        const side = Math.random() < 0.5 ? 1 : -1;
        const candidates = [
          new THREE.Vector3(_dir.x, 0, _dir.z),
          new THREE.Vector3(-_dir.z * side, 0, _dir.x * side),
          new THREE.Vector3(_dir.z * side, 0, -_dir.x * side),
        ];
        for (const c of candidates) {
          if (moveWithCollision(level, enemy, c.x * speed * dt, c.z * speed * dt)) break;
        }
      }

      if (enemy._stuckT >= STUCK_HARD) {
        // Last-resort recovery: place the hostile on the nearest walkable cell
        // around its current position, then rebuild the route next frame. It
        // never teleports across the map, only out of a collision pocket.
        const cell = worldToCell(enemy.mesh.position.x, enemy.mesh.position.z);
        const safeCell = nearestWalkable(level, cell, enemy.type.radius, 4);
        if (safeCell) {
          const safe = cellToWorld(safeCell.x, safeCell.z);
          const test = { x: safe.x, z: safe.z };
          level.resolveCollision(test, enemy.type.radius);
          if (!isBlocked(level, test.x, test.z, enemy.type.radius)) {
            enemy.mesh.position.x = test.x;
            enemy.mesh.position.z = test.z;
          }
        }
        enemy._stuckT = 0;
        enemy._repathT = 0;
      }

      if (_dir.lengthSq() > 0.001) enemy.mesh.rotation.y = Math.atan2(_dir.x, _dir.z);
      enemy.footstepTimer -= dt;
      if (actualMoved > 0.002 && enemy.footstepTimer <= 0) {
        audio?.footstep('enemy');
        enemy.footstepTimer = enemy.state === 'run' ? 0.28 : 0.46;
      }
    }
  }

  if (enemy.state === 'attack') {
    if (_toPlayer.lengthSq() > 0.0001) enemy.mesh.rotation.y = Math.atan2(_toPlayer.x, _toPlayer.z);
    if (dist > enemy.type.attackRange * 1.15) {
      enemy.state = 'walk';
      enemy._repathT = 0;
    } else {
      enemy.attackTimer -= dt;
      if (enemy.attackTimer <= 0) {
        enemy.attackTimer = enemy.type.attackCooldown;
        onAttackPlayer(enemy.type.damage);
      }
    }
  }

  // Watchdog: if a living hostile somehow falls back to idle while inside the
  // pursuit radius, it is reactivated automatically within a short window.
  if (enemy.state === 'idle' && dist <= LOSE_RANGE) {
    enemy._idleWatchT += dt;
    if (enemy._idleWatchT > 0.35) {
      enemy.state = 'walk';
      enemy._idleWatchT = 0;
      enemy._repathT = 0;
    }
  } else {
    enemy._idleWatchT = 0;
  }

  if (enemy.state === 'walk' || enemy.state === 'run' || enemy.state === 'attack') {
    enemy.growlTimer -= dt;
    if (enemy.growlTimer <= 0) {
      const distanceFactor = Math.max(0.12, 1 - dist / DETECT_RANGE);
      audio?.growl(distanceFactor);
      enemy.growlTimer = 2.5 + Math.random() * 3.5;
    }
  }

  enemy.update(dt, {
    moveSpeed: (enemy.state === 'run' ? enemy.type.runSpeed : enemy.type.walkSpeed) / Math.max(0.001, enemy.type.runSpeed)
  });

  enemy._lastX = enemy.mesh.position.x;
  enemy._lastZ = enemy.mesh.position.z;
}

