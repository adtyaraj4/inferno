// EnemyAI.js — simple, cheap state machine: idle -> chase -> attack -> (dead).
import * as THREE from 'three';

const DETECT_RANGE = 16;
const _toPlayer = new THREE.Vector3();

/**
 * Advances one enemy's AI/movement for this frame.
 * @param {import('./Enemy.js').Enemy} enemy
 * @param {import('./Player.js').Player} player
 * @param {import('./Level.js').Level} level
 * @param {(dmg:number)=>void} onAttackPlayer
 */
export function updateEnemyAI(enemy, player, level, dt, onAttackPlayer) {
  if (!enemy.alive) return;

  _toPlayer.set(player.position.x - enemy.mesh.position.x, 0, player.position.z - enemy.mesh.position.z);
  const dist = _toPlayer.length();

  if (enemy.state === 'idle') {
    if (dist < DETECT_RANGE) enemy.state = 'chase';
  }

  if (enemy.state === 'chase') {
    if (dist <= enemy.type.attackRange) {
      enemy.state = 'attack';
    } else if (dist > DETECT_RANGE * 1.6) {
      enemy.state = 'idle';
    } else {
      _toPlayer.normalize();
      const step = enemy.type.speed * dt;
      enemy.mesh.position.x += _toPlayer.x * step;
      enemy.mesh.position.z += _toPlayer.z * step;
      const posXZ = { x: enemy.mesh.position.x, z: enemy.mesh.position.z };
      level.resolveCollision(posXZ, enemy.type.radius);
      enemy.mesh.position.x = posXZ.x;
      enemy.mesh.position.z = posXZ.z;
      enemy.mesh.rotation.y = Math.atan2(_toPlayer.x, _toPlayer.z);
    }
  }

  if (enemy.state === 'attack') {
    enemy.mesh.rotation.y = Math.atan2(_toPlayer.x, _toPlayer.z);
    if (dist > enemy.type.attackRange * 1.15) {
      enemy.state = 'chase';
    } else {
      enemy.attackTimer -= dt;
      if (enemy.attackTimer <= 0) {
        enemy.attackTimer = enemy.type.attackCooldown;
        onAttackPlayer(enemy.type.damage);
      }
    }
  }
}
