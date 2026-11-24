// SOLMAR HEAT - boot and main loop. Builds the bay, wires the player,
// traffic, police, missions, HUD and sound together, and runs the
// third-person camera. Also stages deterministic scenes (?scene=hero,
// drive, chase, beach) used to capture the screenshots in /screenshots.

import * as MGL from './minigl.js';
import { PALETTE } from './config.js';
import { City } from './city.js';
import { Traffic, driveCar, separateCars } from './vehicles.js';
import { Crowd } from './peds.js';
import { Player } from './player.js';
import { Wanted, PoliceFleet } from './police.js';
import { MissionDirector } from './missions.js';
import { Hud } from './hud.js';
import { SoundKit } from './audio.js';

const params = new URLSearchParams(window.location.search);
const sceneMode = params.get('scene') || '';

const canvas = document.getElementById('game-canvas');
const renderer = new MGL.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new MGL.Scene();
scene.fog = new MGL.Fog(PALETTE.fog, 120, 620);

// Sunset sky: a big dome with a vertical gradient painted on a canvas.
function buildSky() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3d2b63');
  grad.addColorStop(0.45, '#b34a6e');
  grad.addColorStop(0.75, '#ff7e5f');
  grad.addColorStop(1, '#ffb36b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new MGL.CanvasTexture(c);
  const dome = new MGL.Mesh(
    new MGL.SphereGeometry(880, 20, 12),
    new MGL.MeshBasicMaterial({ map: tex, side: MGL.BackSide, fog: false })
  );
  scene.add(dome);
  // The low sun itself.
  const sun = new MGL.Mesh(
    new MGL.CircleGeometry(46, 24),
    new MGL.MeshBasicMaterial({ color: 0xffe3a3, fog: false })
  );
  sun.position.set(-260, 92, 760);
  sun.lookAt(0, 30, 0);
  scene.add(sun);
}
buildSky();

const hemi = new MGL.HemisphereLight(0xffd9b0, 0x4a3b5e, 0.95);
scene.add(hemi);
const sunLight = new MGL.DirectionalLight(PALETTE.sun, 1.6);
sunLight.position.set(-120, 160, 220);
scene.add(sunLight);

const camera = new MGL.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 30, 240);

const city = new City(scene);
const traffic = new Traffic(scene, city, 16);
const crowd = new Crowd(scene, 26);
const player = new Player(scene);
const wanted = new Wanted();
const police = new PoliceFleet(scene);
const hud = new Hud();
const sound = new SoundKit();

let bannerTimer = null;
function showBanner(text, ms = 2600) {
  const b = document.getElementById('banner');
  b.textContent = text;
  b.classList.add('show');
  if (bannerTimer) window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => b.classList.remove('show'), ms);
}

let crimeCooldown = 0;
const missions = new MissionDirector(scene, {
  crime: (n) => wanted.setStars(Math.max(wanted.stars, n)),
  onPing: () => sound.blip(880),
  onStep: (label) => hud.toast(label, 4200),
  onComplete: (mission) => {
    player.money += mission.reward;
    sound.payday();
    showBanner('MISSION COMPLETE  +$' + mission.reward);
    saveGame();
  },
});
wanted.onRise = () => hud.pulseStars();

// --- Save / load -------------------------------------------------------
function saveGame() {
  try {
    window.localStorage.setItem('solmar-heat-save', JSON.stringify({
      money: player.money, nextMission: missions.index, done: missions.done,
    }));
  } catch (e) { /* private mode: saving is best-effort */ }
}
function loadGame() {
  try {
    const raw = window.localStorage.getItem('solmar-heat-save');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.money === 'number') player.money = s.money;
    if (typeof s.nextMission === 'number') missions.index = Math.min(4, s.nextMission);
    if (s.done) { missions.done = true; missions.index = 4; }
  } catch (e) { /* ignore a corrupt save */ }
}
loadGame();

// --- Input -------------------------------------------------------------
const keys = {};
let paused = false;
let started = false;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyP' && started) togglePause();
  if (e.code === 'KeyM' && started && !paused && !missions.active && !missions.done) {
    missions.start(missions.index);
  }
  if (e.code === 'KeyE' && started && !paused) toggleCar();
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

let dragYaw = 0, dragPitch = 0, dragging = false;
canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  dragYaw -= e.movementX * 0.005;
  dragPitch = Math.max(-0.1, Math.min(0.9, dragPitch + e.movementY * 0.004));
});
canvas.addEventListener('pointerup', () => { dragging = false; });

function nearestCar(maxDist) {
  let best = null, bestD = maxDist;
  for (const car of traffic.all()) {
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function toggleCar() {
  if (player.driving) {
    player.exitCar();
    sound.engine(false, 0);
    return;
  }
  const car = nearestCar(3.6);
  if (!car) return;
  if (!car.stolenOnce) {
    car.stolenOnce = true;
    if (crimeCooldown <= 0) {
      wanted.addCrime(1);
      crimeCooldown = 6;
      hud.toast('Vehicle taken - the PD has your description.');
    }
  }
  player.enterCar(car);
  sound.blip(520);
}

// --- Overlays ----------------------------------------------------------
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const wastedScreen = document.getElementById('wasted-screen');
function beginPlay() {
  started = true;
  startScreen.classList.add('hidden');
  sound.unlock();
  if (!missions.active && !missions.done) hud.toast('Press M to take the first job: First Wheels.');
}
document.getElementById('start-btn').addEventListener('click', beginPlay);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('respawn-btn').addEventListener('click', respawn);
function togglePause() {
  paused = !paused;
  pauseScreen.classList.toggle('hidden', !paused);
}
function respawn() {
  wastedScreen.classList.add('hidden');
  if (player.driving) player.exitCar();
  player.healFull();
  player.money = Math.max(0, player.money - 150);
  player.x = -98; player.z = 68;
  player.heading = Math.PI / 2;
  player.syncMesh();
  wanted.setStars(0);
  hud.toast('Discharged. The fine cost you $150.');
}

// Demo staging for screenshots: deterministic, no input needed.
let autopilot = false;
if (sceneMode) {
  beginPlay();
  if (sceneMode === 'drive' || sceneMode === 'chase') {
    const car = traffic.parked[2] || traffic.all()[0];
    car.x = -120; car.z = 141; car.heading = Math.PI / 2; car.speed = 16;
    player.enterCar(car);
    autopilot = true;
    missions.start(3); // Beach Courier objectives on the HUD
    if (sceneMode === 'chase') {
      wanted.setStars(3);
      police.maintain(wanted, car);
      for (const c of police.cruisers) { c.x = car.x - 14 - Math.random() * 6; c.z = car.z + (Math.random() - 0.5) * 7; c.heading = Math.PI / 2; }
    }
  } else if (sceneMode === 'beach') {
    player.x = 6; player.z = 176; player.heading = Math.PI;
    player.syncMesh();
    missions.start(3);
  } else if (sceneMode === 'hero') {
    missions.start(0);
  }
}

// --- Camera ------------------------------------------------------------
let camYaw = Math.PI, camPos = new MGL.Vector3(0, 26, 235);
function updateCamera(dt) {
  const target = player.pos;
  if (sceneMode === 'hero') {
    camera.position.set(74, 52, 252);
    camera.lookAt(-10, 6, 60);
    return;
  }
  const focusHeading = player.driving ? player.driving.heading : player.heading;
  let diff = focusHeading - camYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  camYaw += diff * Math.min(1, dt * (player.driving ? 2.6 : 1.6));
  const yaw = camYaw + dragYaw;
  const dist = player.driving ? 10.5 : 7.5;
  const height = (player.driving ? 3.6 : 3.0) + dragPitch * 6;
  const want = new MGL.Vector3(
    target.x - Math.sin(yaw) * dist,
    height,
    target.z - Math.cos(yaw) * dist
  );
  camPos.lerp(want, Math.min(1, dt * 5));
  camera.position.copy(camPos);
  camera.lookAt(target.x, 1.6, target.z);
}

// --- Per-frame update ----------------------------------------------------
const clock = new MGL.Clock();
let pedHitCooldown = 0, carHitCooldown = 0;

function step() {
  requestAnimationFrame(step);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (!started || paused) { renderer.render(scene, camera); return; }

  crimeCooldown = Math.max(0, crimeCooldown - dt);
  pedHitCooldown = Math.max(0, pedHitCooldown - dt);
  carHitCooldown = Math.max(0, carHitCooldown - dt);
  city.update(t);

  const p = player.pos;
  const driving = player.driving;

  if (driving) {
    let input;
    if (autopilot) {
      // Hold Ocean Drive eastbound for the staged shots.
      const laneError = 141 - driving.z;
      input = { throttle: driving.speed < 17 ? 1 : 0, brake: 0, steer: Math.max(-0.4, Math.min(0.4, -laneError * 0.02)) };
    } else {
      input = {
        throttle: (keys.KeyW || keys.ArrowUp) ? 1 : 0,
        brake: (keys.KeyS || keys.ArrowDown || keys.Space) ? 1 : 0,
        steer: ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) + ((keys.KeyD || keys.ArrowRight) ? -1 : 0),
      };
    }
    const impact = driveCar(driving, input, dt, city);
    if (impact > 6) {
      sound.thud(Math.min(3, impact / 8));
      player.hurt(impact > 16 ? 5 : 0);
      if (crimeCooldown <= 0) { wanted.addCrime(1); crimeCooldown = 7; }
    }
    // Traffic interactions.
    for (const other of traffic.all()) {
      if (other === driving) continue;
      const overlap = separateCars(driving, other);
      if (overlap > 0.1 && Math.abs(driving.speed) > 6 && carHitCooldown <= 0) {
        carHitCooldown = 1.2;
        sound.thud(1.4);
        other.speed = driving.speed * 0.4;
        driving.speed *= 0.55;
        if (crimeCooldown <= 0) { wanted.addCrime(1); crimeCooldown = 6; hud.toast('Hit and run!'); }
      }
    }
    // Pedestrians.
    for (const ped of crowd.peds) {
      if (ped.down > 0) continue;
      const d = Math.hypot(ped.x - driving.x, ped.z - driving.z);
      if (d < 1.7 && Math.abs(driving.speed) > 4 && pedHitCooldown <= 0) {
        pedHitCooldown = 1.5;
        ped.knockDown();
        sound.thud(2);
        wanted.addCrime(1);
        hud.toast('You hit a pedestrian!');
      }
    }
    sound.engine(true, Math.abs(driving.speed) / 34);
  } else {
    sound.engine(false, 0);
    // Camera-relative walking.
    const fwd = { x: Math.sin(camYaw + dragYaw), z: Math.cos(camYaw + dragYaw) };
    const right = { x: fwd.z, z: -fwd.x };
    let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) { mx += fwd.x; mz += fwd.z; }
    if (keys.KeyS || keys.ArrowDown) { mx -= fwd.x; mz -= fwd.z; }
    if (keys.KeyA || keys.ArrowLeft) { mx -= right.x; mz -= right.z; }
    if (keys.KeyD || keys.ArrowRight) { mx += right.x; mz += right.z; }
    player.update(dt, mx, mz, !!(keys.ShiftLeft || keys.ShiftRight), city);
  }

  traffic.update(dt, traffic.all().concat(police.cruisers));
  const threats = traffic.cars.concat(police.cruisers);
  if (driving) threats.push(driving);
  crowd.update(dt, threats);

  // Police + wanted.
  police.maintain(wanted, { x: p.x, z: p.z, heading: driving ? driving.heading : player.heading });
  const speedNow = driving ? driving.speed : 0;
  police.update(dt, { x: p.x, z: p.z, heading: driving ? driving.heading : player.heading }, speedNow, city, () => {
    player.hurt(driving ? 3 : 7);
    sound.thud(1.6);
    if (driving) driving.speed *= 0.6;
  });
  const near = police.nearestDistance(p) < 70;
  wanted.update(dt, near);
  sound.siren(wanted.stars > 0 && near);

  missions.update(dt, {
    x: p.x, z: p.z, driving: !!driving, stars: wanted.stars,
  });

  if (player.dead) {
    wastedScreen.classList.remove('hidden');
    sound.engine(false, 0);
    sound.siren(false);
  }

  updateCamera(dt);

  const stepInfo = missions.currentStep();
  hud.update({
    health: player.health,
    money: player.money,
    stars: wanted.stars,
    driving: !!driving,
    speed: speedNow,
    objective: missions.objectiveText(),
    missionName: missions.done ? 'FREE ROAM' : (missions.current() ? missions.current().title : ''),
  });
  hud.drawMinimap({
    x: p.x, z: p.z,
    heading: driving ? driving.heading : player.heading,
    traffic: traffic.cars,
    police: police.cruisers,
    objectivePos: stepInfo && stepInfo.x !== undefined ? { x: stepInfo.x, z: stepInfo.z } : null,
  });

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

step();
