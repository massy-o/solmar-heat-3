// SOLMAR HEAT - the Solmar Bay PD: a wanted-star system with heat that
// cools when you stay clean and hide, plus cruisers that hunt you down.

import { WORLD, WANTED, POLICE_PAINT, POLICE_STRIPE } from './config.js';
import { Car, separateCars } from './vehicles.js';

export class Wanted {
  constructor() {
    this.stars = 0;
    this.quietTime = 0;    // seconds since the last crime
    this.hiddenTime = 0;   // seconds with no cruiser in sight
    this.onRise = null;    // callback(stars) - HUD pulses on a rise
  }

  addCrime(amount, minStars = 0) {
    const before = this.stars;
    this.stars = Math.max(minStars, Math.min(WANTED.maxStars, this.stars + amount));
    this.quietTime = 0;
    if (this.stars > before && this.onRise) this.onRise(this.stars);
  }

  setStars(n) {
    const before = this.stars;
    this.stars = Math.max(0, Math.min(WANTED.maxStars, n));
    this.quietTime = 0;
    if (this.stars > before && this.onRise) this.onRise(this.stars);
  }

  update(dt, cruisersNear) {
    if (this.stars <= 0) return;
    this.quietTime += dt;
    if (!cruisersNear) this.hiddenTime += dt; else this.hiddenTime = 0;
    const hidden = this.hiddenTime >= WANTED.evadeSeconds;
    const need = hidden ? WANTED.decaySeconds * 0.45 : WANTED.decaySeconds;
    if (this.quietTime >= need) {
      this.stars -= 1;
      this.quietTime = 0;
      this.hiddenTime = 0;
    }
  }
}

export class PoliceFleet {
  constructor(scene) {
    this.scene = scene;
    this.cruisers = [];
    this.hitCooldown = 0;
  }

  // Keep one cruiser per star on the street, spawning on avenues
  // a few blocks away so the chase builds instead of teleporting in.
  maintain(wanted, target) {
    const want = wanted.stars;
    while (this.cruisers.length < want) {
      const side = this.cruisers.length % 2 === 0 ? 1 : -1;
      const roadX = WORLD.roadsX[Math.floor(Math.random() * WORLD.roadsX.length)];
      const x = Math.max(WORLD.minX + 6, Math.min(WORLD.maxX - 6, target.x + side * (55 + Math.random() * 25)));
      const z = Math.max(WORLD.minZ + 6, Math.min(WORLD.beachZ - 8, target.z + (Math.random() - 0.5) * 60));
      void roadX;
      const cruiser = new Car(POLICE_PAINT, x, z, Math.atan2(target.x - x, target.z - z),
        { police: true, stripe: POLICE_STRIPE, lightBar: true });
      cruiser.speed = 12;
      this.cruisers.push(cruiser);
      this.scene.add(cruiser.mesh);
    }
    while (this.cruisers.length > want) {
      const c = this.cruisers.pop();
      // Only remove cruisers that are far away; near ones peel off first.
      if (Math.hypot(c.x - target.x, c.z - target.z) < 30 && want > 0) {
        this.cruisers.push(c);
        break;
      }
      this.scene.remove(c.mesh);
    }
  }

  nearestDistance(target) {
    let best = Infinity;
    for (const c of this.cruisers) {
      best = Math.min(best, Math.hypot(c.x - target.x, c.z - target.z));
    }
    return best;
  }

  // Chase steering: aim at where the target will be, throttle hard,
  // and brake only when the angle is hopeless.
  update(dt, target, targetSpeed, city, onRam) {
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    for (const c of this.cruisers) {
      const lead = 0.55;
      const tx = target.x + Math.sin(target.heading || 0) * (targetSpeed || 0) * lead;
      const tz = target.z + Math.cos(target.heading || 0) * (targetSpeed || 0) * lead;
      const dx = tx - c.x, dz = tz - c.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - c.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const topChase = 30;
      let throttle = dist > 14 ? topChase : 13;
      if (Math.abs(diff) > 2.2) throttle = 4; // turn around instead of ploughing on
      c.heading += Math.max(-1, Math.min(1, diff)) * 1.7 * dt * (c.speed >= 0 ? 1 : -1);
      c.speed += (throttle - c.speed) * Math.min(1, dt * (throttle > c.speed ? 0.7 : 2.4));
      const f = c.forward();
      let nx = c.x + f.x * c.speed * dt;
      let nz = c.z + f.z * c.speed * dt;
      const res = city.collide(nx, nz, 1.55);
      if (res.hit) c.speed *= 0.5;
      c.x = res.x; c.z = res.z;
      c.syncMesh();
      // Ramming the target hurts and slows both cars.
      const hitDist = Math.hypot(c.x - target.x, c.z - target.z);
      if (hitDist < 3.2 && this.hitCooldown <= 0) {
        this.hitCooldown = 0.9;
        if (onRam) onRam(c);
      }
    }
    // Cruisers also shove each other apart instead of stacking.
    for (let i = 0; i < this.cruisers.length; i++) {
      for (let j = i + 1; j < this.cruisers.length; j++) {
        separateCars(this.cruisers[i], this.cruisers[j]);
      }
    }
  }
}
