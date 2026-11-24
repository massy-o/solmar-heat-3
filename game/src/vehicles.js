// SOLMAR HEAT - vehicles: mesh factory, civilian traffic that cruises
// the avenue grid, and the arcade driving model for cars the player
// takes. One Car record drives both the traffic AI and player control.

import * as MGL from './minigl.js';
import { WORLD, CAR_PAINTS, CAR_TUNING } from './config.js';
import { makeRng } from './city.js';

let carSerial = 0;

export function buildCarMesh(paint, opts = {}) {
  const group = new MGL.Group();
  const bodyMat = new MGL.MeshLambertMaterial({ color: paint });
  const darkMat = new MGL.MeshLambertMaterial({ color: 0x1c2733 });
  const body = new MGL.Mesh(new MGL.BoxGeometry(1.8, 0.55, 4.3), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new MGL.Mesh(new MGL.BoxGeometry(1.6, 0.5, 2.1), darkMat);
  cabin.position.set(0, 1.05, -0.25);
  group.add(cabin);
  const trim = new MGL.Mesh(
    new MGL.BoxGeometry(1.84, 0.16, 4.34),
    new MGL.MeshLambertMaterial({ color: opts.stripe !== undefined ? opts.stripe : 0x222222 })
  );
  trim.position.y = 0.32;
  group.add(trim);
  // Headlights and tail lights.
  const lightMat = new MGL.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new MGL.MeshBasicMaterial({ color: 0xff4444 });
  for (const sx of [-0.6, 0.6]) {
    const hl = new MGL.Mesh(new MGL.BoxGeometry(0.34, 0.14, 0.06), lightMat);
    hl.position.set(sx, 0.62, 2.16);
    group.add(hl);
    const tl = new MGL.Mesh(new MGL.BoxGeometry(0.34, 0.14, 0.06), tailMat);
    tl.position.set(sx, 0.62, -2.16);
    group.add(tl);
  }
  const wheels = [];
  const wheelGeo = new MGL.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new MGL.MeshLambertMaterial({ color: 0x14161a });
  for (const [wx, wz] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]]) {
    const wheel = new MGL.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  if (opts.lightBar) {
    const bar = new MGL.Group();
    const red = new MGL.Mesh(new MGL.BoxGeometry(0.55, 0.16, 0.4),
      new MGL.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.x = -0.3;
    const blue = new MGL.Mesh(new MGL.BoxGeometry(0.55, 0.16, 0.4),
      new MGL.MeshBasicMaterial({ color: 0x2a6cff }));
    blue.position.x = 0.3;
    bar.add(red, blue);
    bar.position.set(0, 1.42, -0.25);
    group.add(bar);
    group.userData.lightBar = bar;
  }
  group.userData.wheels = wheels;
  return group;
}

export class Car {
  constructor(paint, x, z, heading, opts = {}) {
    this.id = ++carSerial;
    this.mesh = buildCarMesh(paint, opts);
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.paint = paint;
    this.police = !!opts.police;
    this.parked = !!opts.parked;
    this.taken = false;       // the player is driving this car
    this.wrecked = 0;         // 0..1 damage smoke threshold marker
    this.steerVisual = 0;
    this.syncMesh();
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  set x(v) { this.mesh.position.x = v; }
  set z(v) { this.mesh.position.z = v; }

  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  syncMesh() {
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * 0.12;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    const bar = this.mesh.userData.lightBar;
    if (bar) {
      const t = performance.now() * 0.012;
      bar.children[0].visible = Math.sin(t) > 0;
      bar.children[1].visible = Math.sin(t) <= 0;
    }
  }
}

// --- Civilian traffic -------------------------------------------------

export class Traffic {
  constructor(scene, city, count = 16) {
    this.cars = [];
    this.rng = makeRng(WORLD.seed * 7 + 5);
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      const paint = CAR_PAINTS[Math.floor(rng() * CAR_PAINTS.length)];
      const horizontal = rng() > 0.45;
      let car;
      if (horizontal) {
        const roadZ = WORLD.roadsZ[Math.floor(rng() * WORLD.roadsZ.length)];
        const dir = rng() > 0.5 ? 1 : -1;
        const lane = roadZ + (dir > 0 ? 3 : -3);
        const x = WORLD.minX + rng() * (WORLD.maxX - WORLD.minX);
        car = new Car(paint, x, lane, Math.atan2(dir, 0));
        car.route = { axis: 'x', fixed: lane, dir };
      } else {
        const roadX = WORLD.roadsX[Math.floor(rng() * WORLD.roadsX.length)];
        const dir = rng() > 0.5 ? 1 : -1;
        const lane = roadX + (dir > 0 ? -3 : 3);
        const z = WORLD.minZ + rng() * (WORLD.beachZ - WORLD.minZ);
        car = new Car(paint, lane, z, Math.atan2(0, dir));
        car.route = { axis: 'z', fixed: lane, dir };
      }
      car.speed = 9 + rng() * 5;
      car.cruise = car.speed;
      this.cars.push(car);
      scene.add(car.mesh);
    }
    // Parked cars along Ocean Drive and side streets - free to take.
    this.parked = [];
    const spots = [
      [-62, 133], [-4, 155], [44, 133], [118, 155], [152, 133],
      [-122, 52], [62, -52], [-34, -8], [96, 8], [24, 112],
    ];
    for (const [x, z] of spots) {
      const paint = CAR_PAINTS[Math.floor(rng() * CAR_PAINTS.length)];
      const car = new Car(paint, x, z, Math.PI / 2, { parked: true });
      this.parked.push(car);
      scene.add(car.mesh);
    }
    void city;
  }

  all() { return this.cars.concat(this.parked); }

  update(dt, others) {
    for (const car of this.cars) {
      if (car.taken) continue;
      // Slow down when the car ahead in the same lane is close.
      let target = car.cruise;
      for (const other of others) {
        if (other === car || other.taken) continue;
        const dx = other.x - car.x, dz = other.z - car.z;
        const f = car.forward();
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (ahead > 0 && ahead < 9 && side < 1.8) target = Math.min(target, Math.max(0, (ahead - 5) * 1.6));
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 2.2);
      const f = car.forward();
      car.x += f.x * car.speed * dt;
      car.z += f.z * car.speed * dt;
      // Wrap around the world edges back onto the same road.
      if (car.x > WORLD.maxX + 12) car.x = WORLD.minX - 10;
      if (car.x < WORLD.minX - 12) car.x = WORLD.maxX + 10;
      if (car.z > WORLD.beachZ + 4) car.z = WORLD.minZ - 10;
      if (car.z < WORLD.minZ - 12) car.z = WORLD.beachZ;
      car.syncMesh();
    }
    for (const car of this.parked) if (!car.taken) car.syncMesh();
  }
}

// --- Player driving ---------------------------------------------------

// Advance a car the player is driving. input: {throttle, brake, steer}
// Returns the impact strength if the car struck a building this frame.
export function driveCar(car, input, dt, city) {
  const T = CAR_TUNING;
  if (input.throttle > 0) car.speed += T.accel * dt;
  if (input.brake > 0) {
    if (car.speed > 0.6) car.speed -= T.brake * dt;
    else car.speed = Math.max(-T.reverseMax, car.speed - T.accel * 0.6 * dt);
  }
  car.speed -= car.speed * T.drag * dt * (input.throttle > 0 ? 0.35 : 1);
  if (Math.abs(car.speed) < 0.04 && input.throttle === 0 && input.brake === 0) car.speed = 0;
  const topSpeed = 34;
  car.speed = Math.max(-T.reverseMax, Math.min(topSpeed, car.speed));
  // Steering bites harder at low speed and fades at the top end.
  const steerAuthority = T.gripTurn / (1 + Math.abs(car.speed) * 0.055);
  car.heading += input.steer * steerAuthority * dt * Math.sign(car.speed) *
    Math.min(1, Math.abs(car.speed) / 6 + 0.25);
  car.steerVisual = input.steer;
  const f = car.forward();
  let nx = car.x + f.x * car.speed * dt;
  let nz = car.z + f.z * car.speed * dt;
  nx = Math.max(WORLD.minX - 6, Math.min(WORLD.maxX + 6, nx));
  nz = Math.max(WORLD.minZ - 6, Math.min(WORLD.waterZ - 2, nz));
  const before = Math.abs(car.speed);
  const res = city.collide(nx, nz, T.radius);
  nx = res.x; nz = res.z;
  let impact = 0;
  if (res.hit && before > 4) {
    impact = before;
    car.speed *= 0.35;
  } else if (res.hit) {
    car.speed *= 0.7;
  }
  car.x = nx; car.z = nz;
  car.syncMesh();
  return impact;
}

// Soft circle separation between two cars; returns overlap depth.
export function separateCars(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  const min = 3.1;
  if (d2 >= min * min || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const push = (min - d) / 2;
  const ux = dx / d, uz = dz / d;
  a.x -= ux * push; a.z -= uz * push;
  b.x += ux * push; b.z += uz * push;
  return min - d;
}
