// SOLMAR HEAT - pedestrians: low-poly articulated figures who stroll
// the sidewalks and the boardwalk, and scatter when a car comes close.

import * as MGL from './minigl.js';
import { WORLD } from './config.js';
import { makeRng } from './city.js';

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRTS = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xf5f5f5, 0xff8c42, 0x9b5de5];
const PANTS = [0x2b2d42, 0x5a4a3a, 0x3d5a80, 0x6c757d, 0x22223b];

// A simple articulated figure: torso, head, two arms, two legs, all
// pivoting at the shoulder/hip so a walk cycle can swing them.
export function buildFigure(shirt, pants, skin) {
  const g = new MGL.Group();
  const mat = (c) => new MGL.MeshLambertMaterial({ color: c });
  const torso = new MGL.Mesh(new MGL.BoxGeometry(0.52, 0.72, 0.28), mat(shirt));
  torso.position.y = 1.06;
  g.add(torso);
  const head = new MGL.Mesh(new MGL.SphereGeometry(0.21, 10, 8), mat(skin));
  head.position.y = 1.66;
  g.add(head);
  const limbs = { armL: null, armR: null, legL: null, legR: null };
  const mkLimb = (w, len, color, x, y) => {
    const pivot = new MGL.Group();
    pivot.position.set(x, y, 0);
    const m = new MGL.Mesh(new MGL.BoxGeometry(w, len, w), mat(color));
    m.position.y = -len / 2;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  };
  limbs.armL = mkLimb(0.13, 0.62, shirt, -0.34, 1.38);
  limbs.armR = mkLimb(0.13, 0.62, shirt, 0.34, 1.38);
  limbs.legL = mkLimb(0.16, 0.72, pants, -0.14, 0.74);
  limbs.legR = mkLimb(0.16, 0.72, pants, 0.14, 0.74);
  g.userData.limbs = limbs;
  return g;
}

export function poseFigure(mesh, phase, amount) {
  const L = mesh.userData.limbs;
  const s = Math.sin(phase) * amount;
  L.legL.rotation.x = s;
  L.legR.rotation.x = -s;
  L.armL.rotation.x = -s * 0.8;
  L.armR.rotation.x = s * 0.8;
}

export class Pedestrian {
  constructor(scene, rng) {
    const shirt = SHIRTS[Math.floor(rng() * SHIRTS.length)];
    const pants = PANTS[Math.floor(rng() * PANTS.length)];
    const skin = SKIN[Math.floor(rng() * SKIN.length)];
    this.mesh = buildFigure(shirt, pants, skin);
    // Stroll routes: along a street's sidewalk, or along the boardwalk.
    this.horizontal = rng() > 0.4;
    this.dir = rng() > 0.5 ? 1 : -1;
    if (this.horizontal) {
      const nearRoad = WORLD.roadsZ[Math.floor(rng() * WORLD.roadsZ.length)];
      this.fixed = nearRoad + (this.dir > 0 ? WORLD.roadHalf + 1.6 : -WORLD.roadHalf - 1.6);
      this.pos = WORLD.minX + rng() * (WORLD.maxX - WORLD.minX);
      if (rng() < 0.3) this.fixed = 158 + rng() * 4; // boardwalk
    } else {
      const nearRoad = WORLD.roadsX[Math.floor(rng() * WORLD.roadsX.length)];
      this.fixed = nearRoad + (this.dir > 0 ? -WORLD.roadHalf - 1.6 : WORLD.roadHalf + 1.6);
      this.pos = WORLD.minZ + rng() * (WORLD.beachZ - WORLD.minZ);
    }
    this.speed = 1.1 + rng() * 0.9;
    this.phase = rng() * 6;
    this.fleeT = 0;
    this.down = 0; // knocked-down timer
    this.sync(rng);
    scene.add(this.mesh);
  }

  sync() {
    if (this.horizontal) this.mesh.position.set(this.pos, 0, this.fixed);
    else this.mesh.position.set(this.fixed, 0, this.pos);
    this.mesh.rotation.y = this.horizontal
      ? Math.atan2(this.dir, 0)
      : Math.atan2(0, this.dir);
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }

  update(dt, threats) {
    if (this.down > 0) {
      this.down -= dt;
      this.mesh.rotation.x = -Math.PI / 2 + 0.2;
      this.mesh.position.y = 0.25;
      if (this.down <= 0) { this.mesh.rotation.x = 0; this.mesh.position.y = 0; }
      return;
    }
    let speed = this.speed;
    // Flee any fast, close car: sprint sideways away from it.
    for (const t of threats) {
      const dx = this.x - t.x, dz = this.z - t.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 64 && Math.abs(t.speed) > 3) {
        this.fleeT = 0.9;
        this.fleeDir = Math.atan2(dx, dz);
      }
    }
    if (this.fleeT > 0) {
      this.fleeT -= dt;
      speed = 5.2;
      const nx = this.x + Math.sin(this.fleeDir) * speed * dt;
      const nz = this.z + Math.cos(this.fleeDir) * speed * dt;
      if (this.horizontal) { this.pos = nx; this.fixed = nz; }
      else { this.pos = nz; this.fixed = nx; }
      this.mesh.rotation.y = this.fleeDir;
      this.phase += dt * 13;
      poseFigure(this.mesh, this.phase, 0.75);
      this.syncPosOnly();
      return;
    }
    this.pos += this.dir * speed * dt;
    const lim = this.horizontal ? WORLD.maxX : WORLD.beachZ;
    const limMin = this.horizontal ? WORLD.minX : WORLD.minZ;
    if (this.pos > lim - 4) { this.pos = lim - 4; this.dir = -1; }
    if (this.pos < limMin + 4) { this.pos = limMin + 4; this.dir = 1; }
    this.phase += dt * speed * 3.4;
    poseFigure(this.mesh, this.phase, 0.55);
    this.sync();
  }

  syncPosOnly() {
    this.mesh.position.x = this.horizontal ? this.pos : this.fixed;
    this.mesh.position.z = this.horizontal ? this.fixed : this.pos;
  }

  knockDown() {
    if (this.down <= 0) this.down = 4;
  }
}

export class Crowd {
  constructor(scene, count = 26) {
    this.peds = [];
    const rng = makeRng(WORLD.seed * 13 + 9);
    for (let i = 0; i < count; i++) this.peds.push(new Pedestrian(scene, rng));
  }

  update(dt, threats) {
    for (const p of this.peds) p.update(dt, threats);
  }
}
