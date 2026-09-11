// Combat.js — resolves hitscan shots against enemies, and player/pickup overlap.
import * as THREE from 'three';

const PICKUP_RADIUS = 1.1;

/**
 * @param {{raycaster: THREE.Raycaster, damage: number}} shot
 * @param {import('./Enemy.js').Enemy[]} enemies
 * @returns {{enemy: import('./Enemy.js').Enemy, killed: boolean, point: THREE.Vector3} | null}
 */
export function resolveShot(shot, enemies, particles, audio) {
  if (!shot) return null;
  const meshes = enemies.filter((e) => e.alive).map((e) => e.mesh);
  const hits = shot.raycaster.intersectObjects(meshes, true);
  if (hits.length === 0) return null;

  const hit = hits[0];
  let obj = hit.object;
  while (obj && obj.userData.enemyId === undefined) obj = obj.parent;
  if (!obj) return null;

  const enemy = enemies.find((e) => e.id === obj.userData.enemyId);
  if (!enemy || !enemy.alive) return null;

  const killed = enemy.takeDamage(shot.damage, particles, audio);
  return { enemy, killed, point: hit.point };
}

export function resolvePickups(player, level, audio, elapsed) {
  const results = [];
  for (const p of level.pickupPoints) {
    if (!p.active) continue;
    const dx = player.position.x - p.x;
    const dz = player.position.z - p.z;
    if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
      if (p.kind === 'health' && player.health >= player.maxHealth) continue;
      if (p.kind === 'ammo') {
        results.push({ kind: 'ammo' });
      } else {
        player.heal(35);
        results.push({ kind: 'health' });
      }
      level.consumePickup(p, elapsed);
      audio.pickup();
    }
  }
  return results;
}
