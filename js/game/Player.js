// Player.js — first-person controller: movement, gravity, vitals.
import * as THREE from 'three';

const WALK_SPEED = 5.0;
const SPRINT_SPEED = 8.2;
const ACCEL = 45;
const FRICTION = 10;
const JUMP_SPEED = 6.2;
const GRAVITY = 17;
const EYE_HEIGHT = 1.7;
const RADIUS = 0.42;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 28; // per second while sprinting
const STAMINA_REGEN = 16; // per second while not sprinting

export class Player {
  constructor(camera, level) {
    this.camera = camera;
    this.level = level;

    this.position = new THREE.Vector3(0, EYE_HEIGHT, 10);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI; // facing back toward the hall on spawn
    this.pitch = 0;
    this.verticalVelocity = 0;
    this.onGround = true;

    this.health = 100;
    this.maxHealth = 100;
    this.armor = 50;
    this.maxArmor = 100;
    this.stamina = STAMINA_MAX;
    this.alive = true;

    this.input = { forward: 0, right: 0, sprint: false, jumpQueued: false };
    this.camera.position.copy(this.position);
  }

  applyLook(dx, dy, sensitivity = 0.0022) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const limit = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  getForwardVector() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  getRightVector() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  requestJump() { if (this.onGround) this.input.jumpQueued = true; }

  takeDamage(amount) {
    if (!this.alive) return;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.6);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
    return this.alive;
  }

  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }
  addArmor(amount) { this.armor = Math.min(this.maxArmor, this.armor + amount); }

  update(dt) {
    if (!this.alive) return;

    const sprinting = this.input.sprint && this.input.forward !== 0 && this.stamina > 0;
    const targetSpeed = sprinting ? SPRINT_SPEED : WALK_SPEED;

    const forward = this.getForwardVector();
    const right = this.getRightVector();
    const wish = new THREE.Vector3()
      .addScaledVector(forward, this.input.forward)
      .addScaledVector(right, this.input.right);
    if (wish.lengthSq() > 0) wish.normalize();

    const targetVel = wish.multiplyScalar(targetSpeed);
    const accel = wish.lengthSq() > 0 ? ACCEL : FRICTION;
    this.velocity.x += (targetVel.x - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (targetVel.z - this.velocity.z) * Math.min(1, accel * dt);

    // stamina
    if (sprinting) this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
    else this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * dt);

    // gravity / jump
    if (this.input.jumpQueued && this.onGround) {
      this.verticalVelocity = JUMP_SPEED;
      this.onGround = false;
      this.input.jumpQueued = false;
    }
    this.verticalVelocity -= GRAVITY * dt;
    this.position.y += this.verticalVelocity * dt;
    if (this.position.y <= EYE_HEIGHT) {
      this.position.y = EYE_HEIGHT;
      this.verticalVelocity = 0;
      this.onGround = true;
    }

    // horizontal move + collision
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.level.resolveCollision(this.position, RADIUS);

    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
