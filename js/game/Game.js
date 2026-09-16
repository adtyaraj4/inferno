// Game.js — orchestrates the Three.js scene, input, waves, HUD, and menus.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Level } from './Level.js';
import { Player } from './Player.js';
import { Weapon } from './Weapon.js';
import { Enemy, ENEMY_TYPES } from './Enemy.js';
import { updateEnemyAI } from './EnemyAI.js';
import { resolveShot, resolvePickups } from './Combat.js';
import { ParticleSystem } from './ParticleSystem.js';
import { HUD } from './HUD.js';
import { AudioManager } from './AudioManager.js';
import { submitScore } from '../leaderboard.js';

const MAX_DT = 1 / 20; // clamp huge frame gaps (tab switches, slow devices)
const ENEMY_TYPE_KEYS = Object.keys(ENEMY_TYPES);

// A compact fragment shader: vignette + faint scanlines + a whisper of
// chromatic aberration, all in one pass so post-processing stays cheap.
const GrimShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignetteStrength: { value: 0.18 } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignetteStrength;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 fromCenter = uv - 0.5;
      float aberration = 0.0022;
      float r = texture2D(tDiffuse, uv - fromCenter * aberration).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + fromCenter * aberration).b;
      vec3 color = vec3(r, g, b);

      float vig = smoothstep(0.42, 0.78, length(fromCenter));
      color *= mix(1.0 - vignetteStrength, 1.0, vig);

      float scan = sin(uv.y * 800.0 + time * 4.0) * 0.006;
      color -= scan;

      float grain = fract(sin(dot(uv * max(time, 0.01), vec2(12.9898, 78.233))) * 43758.5453) * 0.012;
      color += grain - 0.006;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

class InfernoGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.dom = {
      loading: document.getElementById('loadingOverlay'),
      loadingFill: document.getElementById('loadingBarFill'),
      mainMenu: document.getElementById('mainMenu'),
      controlsModal: document.getElementById('controlsModal'),
      pauseMenu: document.getElementById('pauseMenu'),
      deathOverlay: document.getElementById('deathOverlay'),
      deathStats: document.getElementById('deathStats'),
      scoreForm: document.getElementById('scoreForm'),
      nameInput: document.getElementById('playerNameInput'),
      touchControls: document.getElementById('touchControls'),
    };

    this.state = 'loading'; // loading | menu | playing | paused | dead
    this.clock = new THREE.Clock();
    this.audio = new AudioManager();

    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.enemies = [];
    this.enemiesRemainingToSpawn = 0;
    this.waveTotal = 0;
    this.waveSpawned = 0;
    this.spawnTimer = 0;
    this.waveActive = false;

    this.shakeMagnitude = 0;
    this._frameMouseDelta = { x: 0, y: 0 };

    this._initRenderer();
    this._initScene();
    this._initPostProcessing();
    this._initInput();
    this._bindMenus();
    this._runLoadingSequence();

    window.addEventListener('resize', () => this._onResize());
  }

  /* ---------------------------------------------------------------- setup */

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    // Post-processing roughly doubles fill cost, so cap DPR a little tighter
    // than the marketing page does to keep frame time predictable.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false; // perf: fake shading via emissive/point lights instead
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 120);
  }

  _initScene() {
    this.level = new Level(this.scene);
    this.player = new Player(this.camera, this.level);
    this.particles = new ParticleSystem(this.scene);
    this.weapon = new Weapon(this.camera, this.particles, this.audio, 'pulse');
    this.hud = new HUD();

    // A camera-mounted fill light so whatever the player is looking at —
    // including approaching enemies in unlit corridors — stays visible.
    this.headlamp = new THREE.PointLight(0xfff4e5, 4.6, 28, 0);
    this.headlamp.position.set(0, 0, 0.4);
    this.camera.add(this.headlamp);
    this.scene.add(this.camera);
  }

  _initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Bloom is tuned to a high threshold so it only catches genuinely bright
    // emissive surfaces (fire trim, cores, muzzle flashes) rather than
    // blowing out every mid-tone in the scene.
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.30, 0.32, 0.90);
    this.composer.addPass(this.bloomPass);

    this.grimPass = new ShaderPass(GrimShader);
    this.composer.addPass(this.grimPass);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass?.setSize(window.innerWidth, window.innerHeight);
  }

  _runLoadingSequence() {
    let pct = 0;
    const tick = () => {
      pct += 8 + Math.random() * 18;
      this.dom.loadingFill.style.width = `${Math.min(100, pct)}%`;
      if (pct < 100) {
        setTimeout(tick, 110);
      } else {
        setTimeout(() => {
          this.dom.loading.hidden = true;
          this._showMenu();
        }, 200);
      }
    };
    tick();
  }

  /* ----------------------------------------------------------------- input */

  _initInput() {
    this.keys = new Set();
    this.mouseDown = false;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.state === 'playing') {
        if (e.code === 'KeyR') this.weapon.startReload();
        if (e.code === 'Escape') this._togglePause();
      }
      this._syncMoveInput();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this._syncMoveInput();
    });

    this.canvas.addEventListener('mousedown', () => { this.mouseDown = true; });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas && this.state === 'playing') {
        this.player.applyLook(e.movementX, e.movementY);
        this._frameMouseDelta.x += e.movementX;
        this._frameMouseDelta.y += e.movementY;
      }
    });

    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this.state === 'playing') {
        this._pause();
      }
    });

    this._initTouchControls();
  }

  _syncMoveInput() {
    const p = this.player;
    if (!p) return;
    let forward = 0, right = 0;
    if (this.keys.has('KeyW') || this.touch.forward > 0) forward += 1;
    if (this.keys.has('KeyS')) forward -= 1;
    if (this.keys.has('KeyD')) right += 1;
    if (this.keys.has('KeyA')) right -= 1;
    if (this.touch.active) { forward = this.touch.forward; right = this.touch.right; }
    p.input.forward = forward;
    p.input.right = right;
    p.input.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.sprint;
    if (this.keys.has('Space')) p.requestJump();
  }

  _initTouchControls() {
    this.touch = { active: false, forward: 0, right: 0, sprint: false, firing: false, look: { id: null, x: 0, y: 0 } };
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouch) return;

    this.dom.touchControls.hidden = false;

    const joystick = document.getElementById('touchJoystick');
    const knob = document.getElementById('touchJoystickKnob');
    let joyId = null, joyOrigin = { x: 0, y: 0 };

    joystick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      joyId = t.identifier;
      const rect = joystick.getBoundingClientRect();
      joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.touch.active = true;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          const dx = t.clientX - joyOrigin.x;
          const dy = t.clientY - joyOrigin.y;
          const max = 46;
          const len = Math.min(max, Math.hypot(dx, dy));
          const ang = Math.atan2(dy, dx);
          const nx = Math.cos(ang) * len, ny = Math.sin(ang) * len;
          knob.style.transform = `translate(${nx}px, ${ny}px)`;
          this.touch.forward = -ny / max;
          this.touch.right = nx / max;
          this.touch.sprint = len > max * 0.85;
        }
        if (t.identifier === this.touch.look.id) {
          const dx = t.clientX - this.touch.look.x;
          const dy = t.clientY - this.touch.look.y;
          this.touch.look.x = t.clientX;
          this.touch.look.y = t.clientY;
          if (this.state === 'playing') {
            this.player.applyLook(dx * 2.2, dy * 2.2);
            this._frameMouseDelta.x += dx * 2.2;
            this._frameMouseDelta.y += dy * 2.2;
          }
        }
      }
      this._syncMoveInput();
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          knob.style.transform = 'translate(0,0)';
          this.touch.forward = 0; this.touch.right = 0; this.touch.sprint = false;
        }
        if (t.identifier === this.touch.look.id) this.touch.look.id = null;
      }
      this._syncMoveInput();
    });

    const lookPad = document.getElementById('touchLook');
    lookPad.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this.touch.look.id = t.identifier;
      this.touch.look.x = t.clientX;
      this.touch.look.y = t.clientY;
    }, { passive: true });

    document.getElementById('touchFire').addEventListener('touchstart', (e) => { e.preventDefault(); this.touch.firing = true; }, { passive: false });
    document.getElementById('touchFire').addEventListener('touchend', () => { this.touch.firing = false; });
    document.getElementById('touchJump').addEventListener('touchstart', (e) => { e.preventDefault(); this.player?.requestJump(); }, { passive: false });
    document.getElementById('touchReload').addEventListener('touchstart', (e) => { e.preventDefault(); this.weapon?.startReload(); }, { passive: false });
  }

  /* ------------------------------------------------------------------ menus */

  _bindMenus() {
    document.getElementById('startMissionBtn').addEventListener('click', () => { this.audio.unlock(); this.audio.menuClick(); this._startMission(); });
    document.getElementById('controlsBtn').addEventListener('click', () => this._showControls());
    document.getElementById('pauseControlsBtn').addEventListener('click', () => this._showControls());
    document.getElementById('closeControlsBtn').addEventListener('click', () => { this.dom.controlsModal.hidden = true; });
    document.getElementById('resumeBtn').addEventListener('click', () => this._resume());
    document.getElementById('restartBtn').addEventListener('click', () => this._startMission());

    this.dom.scoreForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitScore({ name: this.dom.nameInput.value, score: this.score, kills: this.kills, wave: this.wave });
      this.dom.scoreForm.querySelector('button').textContent = 'Saved ✓';
      this.dom.scoreForm.querySelector('button').disabled = true;
    });
  }

  _showMenu() {
    this.state = 'menu';
    this.dom.mainMenu.hidden = false;
    this.hud.hide();
  }

  _showControls() {
    this.dom.controlsModal.hidden = false;
  }

  _startMission() {
    // reset state
    this.dom.mainMenu.hidden = true;
    this.dom.pauseMenu.hidden = true;
    this.dom.deathOverlay.hidden = true;
    this.dom.scoreForm.querySelector('button').disabled = false;
    this.dom.scoreForm.querySelector('button').textContent = 'Submit Score';
    this.dom.nameInput.value = '';

    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.waveActive = false;

    this.player.health = this.player.maxHealth;
    this.player.armor = 50;
    this.player.position.set(0, 1.7, 10);
    this.player.velocity.set(0, 0, 0);
    this.player.yaw = Math.PI;
    this.player.pitch = 0;
    this.player.alive = true;

    this.weapon.setWeapon('pulse');

    this.state = 'playing';
    this.hud.show();
    this.hud.setObjective('Eliminate all hostiles');
    this._nextWave();
    this.audio.startAmbience();

    if (!('ontouchstart' in window)) this.canvas.requestPointerLock();
    this.clock.getDelta(); // discard time spent in menu
  }

  _togglePause() {
    if (this.state === 'playing') this._pause();
    else if (this.state === 'paused') this._resume();
  }

  _pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.dom.pauseMenu.hidden = false;
  }

  _resume() {
    this.state = 'playing';
    this.dom.pauseMenu.hidden = true;
    if (!('ontouchstart' in window)) this.canvas.requestPointerLock();
    this.clock.getDelta();
  }

  _die() {
    this.state = 'dead';
    document.exitPointerLock?.();
    this.audio.death();
    this.audio.stopAmbience();
    this.dom.deathStats.textContent = `Score: ${Math.round(this.score).toLocaleString()} · Kills: ${this.kills} · Wave: ${this.wave}`;
    this.dom.deathOverlay.hidden = false;
    this.hud.hide();
  }

  /* ------------------------------------------------------------------ waves */

  _nextWave() {
    this.wave++;
    this.waveActive = true;
    this.waveTotal = 3 + this.wave * 2;
    this.waveSpawned = 0;
    this.enemiesRemainingToSpawn = this.waveTotal;
    this.spawnTimer = 0;
    this.audio.waveStart();
    this.hud.showWaveBanner(`WAVE ${this.wave}`);
    this.hud.setObjective(`Survive wave ${this.wave} — ${this.enemiesRemainingToSpawn} hostiles inbound`);
  }

  _spawnEnemy() {
    const points = this.level.spawnPoints;
    const living = this.enemies.filter((e) => e.alive);
    const px = this.player.position.x;
    const pz = this.player.position.z;

    const typePool =
      this.wave < 2 ? ['VOID_CRAWLER'] :
      this.wave < 4 ? ['VOID_CRAWLER', 'ASH_HOUND'] :
      ENEMY_TYPE_KEYS;
    const typeKey = typePool[Math.floor(Math.random() * typePool.length)];
    const radius = ENEMY_TYPES[typeKey].radius;

    const isClear = (x, z, minPlayerDist, minEnemyDist) => {
      // Never use a point that is inside an AABB collider.
      for (const c of this.level.colliders) {
        const cx = Math.max(c.minX, Math.min(x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz < (radius + 0.05) ** 2) return false;
      }

      const pdx = x - px;
      const pdz = z - pz;
      if (pdx * pdx + pdz * pdz < minPlayerDist * minPlayerDist) return false;

      for (const e of living) {
        const dx = x - e.mesh.position.x;
        const dz = z - e.mesh.position.z;
        if (dx * dx + dz * dz < minEnemyDist * minEnemyDist) return false;
      }
      return true;
    };

    // Prefer the points farthest from the player so hostiles don't pop directly
    // into view, but DO NOT require a narrow distance band. Every point is a
    // legitimate corridor location and can be reached by A*.
    const ordered = [...points]
      .map((p) => ({ ...p, d2: (p.x - px) ** 2 + (p.z - pz) ** 2 }))
      .sort((a, b) => b.d2 - a.d2);

    let pos = null;

    // Relax constraints progressively. With 12 real corridor points this should
    // normally succeed in the first pass; the later passes are just a safety net.
    const passes = [
      { player: 10, enemy: 3.4 },
      { player: 7, enemy: 3.0 },
      { player: 5, enemy: 2.4 },
      { player: 0, enemy: 2.0 },
    ];

    for (const pass of passes) {
      for (const p of ordered) {
        if (isClear(p.x, p.z, pass.player, pass.enemy)) {
          pos = new THREE.Vector3(p.x, 0, p.z);
          break;
        }
      }
      if (pos) break;
    }

    // The spawn system must never silently lose a required wave slot. If every
    // point is occupied, reuse the safest existing corridor point rather than
    // failing the spawn request.
    if (!pos && ordered.length) {
      let best = null;
      let bestScore = -Infinity;
      for (const p of ordered) {
        if (!isClear(p.x, p.z, 0, 0)) continue;
        const playerD2 = (p.x - px) ** 2 + (p.z - pz) ** 2;
        let nearestEnemy = Infinity;
        for (const e of living) {
          nearestEnemy = Math.min(
            nearestEnemy,
            Math.hypot(p.x - e.mesh.position.x, p.z - e.mesh.position.z)
          );
        }
        const score = Math.sqrt(playerD2) + (nearestEnemy === Infinity ? 20 : nearestEnemy * 2);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      if (best) pos = new THREE.Vector3(best.x, 0, best.z);
    }

    if (!pos) {
      console.warn('[INFERNO] No valid enemy spawn point available.');
      return false;
    }

    const enemy = new Enemy(typeKey, this.scene, pos);
    // Activate immediately. The AI has global awareness, so a spawned hostile
    // begins navigating on the next simulation tick rather than idling unseen.
    enemy.state = 'walk';
    enemy._repathT = 0;
    enemy._path = null;
    this.enemies.push(enemy);
    this.waveSpawned++;

    this.particles.explosion(
      pos.clone().add(new THREE.Vector3(0, 0.8, 0)),
      [0.6, 0.2, 0.9]
    );
    this.audio.enemySpawn();
    return true;
  }

  addShake(amount) {
    this.shakeMagnitude = Math.min(0.35, Math.max(this.shakeMagnitude, amount));
  }

  /* ------------------------------------------------------------------- loop */

  start() {
    this.renderer.setAnimationLoop((t) => this._tick(t));
  }

  _tick(timeMs) {
    const dt = Math.min(this.clock.getDelta(), MAX_DT);
    const elapsed = this.clock.elapsedTime;

    this.level.update(dt, elapsed);
    this.particles.update(dt);

    if (this.state === 'playing') {
      this._updateGameplay(dt, elapsed);
    }

    // Dead enemies keep animating their collapse regardless of pause state
    // so a death mid-pause doesn't freeze awkwardly; living enemies are
    // driven entirely through updateEnemyAI while playing (see above).
    for (const e of this.enemies) {
      if (!e.alive) e.update(dt);
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.deathT < 0.7);

    this.hud.tick(dt);

    if (this.grimPass) this.grimPass.uniforms.time.value = elapsed;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  _updateGameplay(dt, elapsed) {
    this.player.update(dt);
    if (!this.player.alive) { this._die(); return; }

    // screen shake: apply a decaying random jitter on top of the player's
    // "clean" camera transform that update() just set
    if (this.shakeMagnitude > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeMagnitude;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeMagnitude;
      this.shakeMagnitude *= Math.max(0, 1 - dt * 8);
    } else {
      this.shakeMagnitude = 0;
    }

    const moving = Math.abs(this.player.input.forward) + Math.abs(this.player.input.right) > 0;
    this.weapon.update(dt, moving, this.player, this._frameMouseDelta);
    this._frameMouseDelta.x = 0;
    this._frameMouseDelta.y = 0;

    const wantsFire = this.mouseDown || this.touch.firing;
    if (wantsFire) {
      const shot = this.weapon.tryFire(this.player);
      if (shot && this.weapon.def.kind === 'hellfire') this.addShake(0.06);
      const result = resolveShot(shot, this.enemies, this.level, this.particles, this.audio);
      if (result?.enemy) {
        this.hud.flashHitMarker(result.headshot);
        if (result.killed) {
          this.kills++;
          this.score += result.enemy.type.scoreValue + (result.headshot ? 40 : 0);
        }
      }
    }

    // enemy AI + attacks
    for (const enemy of this.enemies) {
      updateEnemyAI(enemy, this.player, this.level, dt, (dmg) => {
        const alive = this.player.takeDamage(dmg);
        this.hud.flashDamage();
        this.audio.playerHurt();
        this.addShake(0.12);
        if (!alive) this._die();
      }, this.audio);
    }

    // pickups
    const picked = resolvePickups(this.player, this.level, this.audio, elapsed);
    for (const p of picked) {
      if (p.kind === 'ammo') this.weapon.reserve = Math.min(this.weapon.def.reserveMax, this.weapon.reserve + Math.round(this.weapon.def.magSize * 1.5));
    }

    // wave spawning / completion
    if (this.waveActive) {
      if (this.enemiesRemainingToSpawn > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const spawned = this._spawnEnemy();
          if (spawned) this.enemiesRemainingToSpawn--;
          // Retry quickly when no valid point was available; never silently
          // lose a required wave enemy.
          this.spawnTimer = spawned ? 0.9 : 0.2;
        }
      } else if (this.enemies.every((e) => !e.alive)) {
        this.waveActive = false;
        this.hud.setObjective(`Area clear — wave ${this.wave} complete`);
        setTimeout(() => { if (this.state === 'playing') this._nextWave(); }, 2400);
      }
    }

    const livingHostiles = this.enemies.filter((e) => e.alive).length;
    if (this.waveActive && this.enemiesRemainingToSpawn === 0 && livingHostiles > 0) {
      this.hud.setObjective(`Wave ${this.wave} — ${livingHostiles} hostile${livingHostiles === 1 ? '' : 's'} remaining`);
    }
    this.hud.update({ score: this.score, kills: this.kills, wave: this.wave, player: this.player, weapon: this.weapon });
    this.hud.updateRadar(this.enemies, this.player);
  }
}

const game = new InfernoGame();
game.start();
