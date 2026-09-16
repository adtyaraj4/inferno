// Combat.js — resolves hitscan shots against enemies/level geometry, and
// player/pickup overlap.
import * as THREE from 'three';

const PICKUP_RADIUS = 1.1;

/**
 * @param {{raycaster: THREE.Raycaster, damage: number}} shot
 * @param {import('./Enemy.js').Enemy[]} enemies
 * @param {import('./Level.js').Level} level
 * @returns {{enemy?: import('./Enemy.js').Enemy, killed: boolean, headshot: boolean, wallHit?: THREE.Vector3, wallNormal?: THREE.Vector3} | null}
 */
export function resolveShot(shot, enemies, level, particles, audio) {
  if (!shot) return null;
  const enemyMeshes = enemies.filter((e) => e.alive).map((e) => e.mesh);
  const enemyHits = shot.raycaster.intersectObjects(enemyMeshes, true);
  const levelHits = level ? shot.raycaster.intersectObjects(level.group.children, true) : [];

  const nearestEnemyDist = enemyHits.length ? enemyHits[0].distance : Infinity;
  const nearestWallDist = levelHits.length ? levelHits[0].distance : Infinity;

  if (enemyHits.length > 0 && nearestEnemyDist <= nearestWallDist) {
    const hit = enemyHits[0];
    let obj = hit.object;
    while (obj && obj.userData.enemyId === undefined) obj = obj.parent;
    if (!obj) return null;
    const enemy = enemies.find((e) => e.id === obj.userData.enemyId);
    if (!enemy || !enemy.alive) return null;

    const { killed, headshot } = enemy.takeDamage(shot.damage, hit.object, particles, audio);
    return { enemy, killed, headshot, point: hit.point };
  }

  if (levelHits.length > 0) {
    const hit = levelHits[0];
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    particles?.wallSparks(hit.point, normal);
    audio?.wallImpact();
    return { killed: false, headshot: false, wallHit: hit.point, wallNormal: normal };
  }

  return null;
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
