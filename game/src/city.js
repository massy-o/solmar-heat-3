// SOLMAR HEAT - procedural city builder for Solmar Bay.
// A seeded grid of avenues and streets with 3 districts:
// Centro (downtown towers), the beachfront along Ocean Drive, and
// Port Solmar with its warehouses and cranes in the east.

import * as MGL from './minigl.js';
import { WORLD, PALETTE } from './config.js';

// mulberry32: small deterministic PRNG so every visitor sees the same city.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUILDING_TONES = [0xd9c9a8, 0xc7d3d9, 0xe8b4a0, 0xb5c9c0, 0xf0e2c4, 0xa8bfd4, 0xe6ccb2, 0xd4a373];

function box(w, h, d, color, x, y, z, ry = 0) {
  const mesh = new MGL.Mesh(
    new MGL.BoxGeometry(w, h, d),
    new MGL.MeshLambertMaterial({ color })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  return mesh;
}

// Canvas texture with the game's name, used for the rooftop sign.
function makeSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 192;
  const g = canvas.getContext('2d');
  g.fillStyle = '#2a1450';
  g.fillRect(0, 0, 1024, 192);
  g.strokeStyle = '#ff5d8f';
  g.lineWidth = 10;
  g.strokeRect(10, 10, 1004, 172);
  g.font = 'bold 118px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd166';
  g.shadowColor = '#ff9e00';
  g.shadowBlur = 26;
  g.fillText('SOLMAR HEAT', 512, 100);
  const tex = new MGL.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// Window-lit facade texture so towers read as buildings, not blocks.
function makeFacadeTexture(base, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 240; y += 22) {
    for (let x = 10; x < 118; x += 20) {
      const lit = rng() > 0.45;
      g.fillStyle = lit ? 'rgba(255,214,140,0.95)' : 'rgba(40,60,90,0.85)';
      g.fillRect(x, y, 12, 14);
    }
  }
  const tex = new MGL.CanvasTexture(canvas);
  tex.wrapS = MGL.RepeatWrapping;
  return tex;
}

export class City {
  constructor(scene) {
    this.group = new MGL.Group();
    this.colliders = [];   // {minX,maxX,minZ,maxZ} for buildings and props
    this.lampHeads = [];
    this.water = null;
    this.tallest = null;   // {x,z,h} of the Centro tower carrying the sign
    scene.add(this.group);
    this.build();
  }

  addCollider(x, z, halfW, halfD) {
    this.colliders.push({ minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD });
  }

  build() {
    const rng = makeRng(WORLD.seed);
    this.buildGround(rng);
    this.buildRoads();
    this.buildBlocks(rng);
    this.buildStreetlights(rng);
    this.buildPalms(rng);
    this.buildBeach(rng);
    this.buildPort(rng);
    this.buildSign();
  }

  buildGround(rng) {
    const W = WORLD.maxX - WORLD.minX, D = WORLD.maxZ - WORLD.minZ;
    const cx = (WORLD.minX + WORLD.maxX) / 2, cz = (WORLD.minZ + WORLD.maxZ) / 2;
    const ground = new MGL.Mesh(
      new MGL.PlaneGeometry(W, D),
      new MGL.MeshLambertMaterial({ color: PALETTE.ground })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, 0, cz);
    this.group.add(ground);

    // Sand strip and the bay itself.
    const sandDepth = WORLD.waterZ - WORLD.beachZ + 26;
    const sand = new MGL.Mesh(
      new MGL.PlaneGeometry(W, sandDepth),
      new MGL.MeshLambertMaterial({ color: PALETTE.sand })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(cx, 0.02, WORLD.beachZ + sandDepth / 2 - 13);
    this.group.add(sand);

    const water = new MGL.Mesh(
      new MGL.PlaneGeometry(W, 190),
      new MGL.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, 0.06, WORLD.waterZ + 95);
    this.group.add(water);
    this.water = water;

    // A low boardwalk between Ocean Drive and the sand.
    const walk = box(W, 0.18, 5, 0x9a7b58, cx, 0.09, WORLD.beachZ - 4);
    this.group.add(walk);
    void rng;
  }

  buildRoads() {
    const roadMat = new MGL.MeshLambertMaterial({ color: PALETTE.road });
    const lineMat = new MGL.MeshBasicMaterial({ color: PALETTE.roadLine });
    const W = WORLD.maxX - WORLD.minX, D = WORLD.maxZ - WORLD.minZ;
    const cx = (WORLD.minX + WORLD.maxX) / 2, cz = (WORLD.minZ + WORLD.maxZ) / 2;
    for (const z of WORLD.roadsZ) {
      const road = new MGL.Mesh(new MGL.PlaneGeometry(W, WORLD.roadHalf * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(cx, 0.04, z);
      this.group.add(road);
      for (let x = WORLD.minX + 8; x < WORLD.maxX - 6; x += 14) {
        const dash = new MGL.Mesh(new MGL.PlaneGeometry(5, 0.35), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.06, z);
        this.group.add(dash);
      }
    }
    for (const x of WORLD.roadsX) {
      const road = new MGL.Mesh(new MGL.PlaneGeometry(WORLD.roadHalf * 2, D), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.04, cz);
      this.group.add(road);
      for (let z = WORLD.minZ + 8; z < WORLD.beachZ - 6; z += 14) {
        const dash = new MGL.Mesh(new MGL.PlaneGeometry(0.35, 5), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.06, z);
        this.group.add(dash);
      }
    }
    // Ocean Drive: the beachfront boulevard along z = 144.
    const ocean = new MGL.Mesh(new MGL.PlaneGeometry(W, WORLD.roadHalf * 2 + 4), roadMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(cx, 0.045, 144);
    this.group.add(ocean);
  }

  districtOf(x, z) {
    if (x > 118) return 'port';
    if (z > 84) return 'beach';
    if (Math.abs(x) < 118 && z < 84 && z > -140) return 'centro';
    return 'suburb';
  }

  buildBlocks(rng) {
    const xs = WORLD.roadsX, zs = WORLD.roadsZ;
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const x0 = xs[i] + WORLD.roadHalf, x1 = xs[i + 1] - WORLD.roadHalf;
        const z0 = zs[j] + WORLD.roadHalf, z1 = zs[j + 1] - WORLD.roadHalf;
        const bx = (x0 + x1) / 2, bz = (z0 + z1) / 2;
        const bw = x1 - x0, bd = z1 - z0;
        // Sidewalk slab for the whole block.
        this.group.add(box(bw, 0.24, bd, PALETTE.sidewalk, bx, 0.12, bz));
        const district = this.districtOf(bx, bz);
        // Split each block into 2x2 lots.
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            const lx = x0 + bw * (0.25 + 0.5 * a);
            const lz = z0 + bd * (0.25 + 0.5 * b);
            const w = bw * 0.36, d = bd * 0.36;
            let h;
            if (district === 'centro') h = 22 + rng() * 46;
            else if (district === 'beach') h = 8 + rng() * 14;
            else if (district === 'port') h = 6 + rng() * 5;
            else h = 6 + rng() * 12;
            const tone = BUILDING_TONES[Math.floor(rng() * BUILDING_TONES.length)];
            const hex = '#' + tone.toString(16).padStart(6, '0');
            const tex = makeFacadeTexture(hex, rng);
            tex.repeat.set(1, Math.max(1, Math.round(h / 14)));
            tex.wrapT = MGL.RepeatWrapping;
            const mat = new MGL.MeshLambertMaterial({ map: tex });
            const bld = new MGL.Mesh(new MGL.BoxGeometry(w, h, d), mat);
            bld.position.set(lx, h / 2 + 0.2, lz);
            this.group.add(bld);
            this.addCollider(lx, lz, w / 2, d / 2);
            // Rooftop cap.
            this.group.add(box(w * 0.4, 1.2, d * 0.4, 0x6b6f78, lx, h + 0.8, lz));
            if (!this.tallest || h > this.tallest.h) {
              if (district === 'centro') this.tallest = { x: lx, z: lz, h, w };
            }
          }
        }
      }
    }
  }

  buildStreetlights(rng) {
    const poleMat = new MGL.MeshLambertMaterial({ color: 0x3a3f4a });
    const headMat = new MGL.MeshBasicMaterial({ color: 0xffe6a3 });
    for (const z of WORLD.roadsZ) {
      for (let x = WORLD.minX + 20; x < WORLD.maxX; x += 44) {
        this.makeLamp(x + (rng() * 6 - 3), z - WORLD.roadHalf - 1.4, poleMat, headMat);
        this.makeLamp(x + 22, z + WORLD.roadHalf + 1.4, poleMat, headMat);
      }
    }
    for (let z = WORLD.beachZ - 12; z < WORLD.beachZ; z += 60) void z;
    for (let x = WORLD.minX + 16; x < WORLD.maxX; x += 40) {
      this.makeLamp(x, 136, poleMat, headMat);
    }
  }

  makeLamp(x, z, poleMat, headMat) {
    const pole = new MGL.Mesh(new MGL.CylinderGeometry(0.12, 0.16, 5.6, 6), poleMat);
    pole.position.set(x, 2.8, z);
    this.group.add(pole);
    const head = new MGL.Mesh(new MGL.SphereGeometry(0.34, 8, 6), headMat);
    head.position.set(x, 5.7, z);
    this.group.add(head);
    this.lampHeads.push(head);
  }

  buildPalms(rng) {
    const trunkMat = new MGL.MeshLambertMaterial({ color: PALETTE.palmTrunk });
    const leafMat = new MGL.MeshLambertMaterial({ color: PALETTE.palmLeaf });
    const spots = [];
    for (let x = WORLD.minX + 10; x < WORLD.maxX - 6; x += 17) spots.push([x + rng() * 5, 156 + rng() * 5]);
    for (let x = WORLD.minX + 12; x < WORLD.maxX - 6; x += 26) spots.push([x + rng() * 5, 134 - rng() * 4]);
    for (const [x, z] of spots) {
      const lean = (rng() - 0.5) * 0.16;
      const trunk = new MGL.Mesh(new MGL.CylinderGeometry(0.16, 0.26, 6.4, 6), trunkMat);
      trunk.position.set(x, 3.2, z);
      trunk.rotation.z = lean;
      this.group.add(trunk);
      for (let k = 0; k < 6; k++) {
        const leaf = new MGL.Mesh(new MGL.ConeGeometry(0.5, 3.6, 4), leafMat);
        const ang = (k / 6) * Math.PI * 2;
        leaf.position.set(x + Math.cos(ang) * 1.1 - lean * 6, 6.6, z + Math.sin(ang) * 1.1);
        leaf.rotation.set(Math.sin(ang) * 1.15, 0, Math.cos(ang) * 1.15 + Math.PI);
        this.group.add(leaf);
      }
      this.addCollider(x, z, 0.4, 0.4);
    }
  }

  buildBeach(rng) {
    const towelColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da];
    const skinTones = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
    for (let i = 0; i < 16; i++) {
      const x = WORLD.minX + 24 + rng() * (WORLD.maxX - WORLD.minX - 48);
      const z = WORLD.beachZ + 6 + rng() * 26;
      const ry = rng() * Math.PI;
      // Umbrella: pole plus a wide tilted cone canopy.
      const pole = new MGL.Mesh(
        new MGL.CylinderGeometry(0.05, 0.05, 2.3, 5),
        new MGL.MeshLambertMaterial({ color: 0xeeeeee })
      );
      pole.position.set(x, 1.15, z);
      pole.rotation.z = 0.14;
      this.group.add(pole);
      const canopy = new MGL.Mesh(
        new MGL.ConeGeometry(1.9, 0.7, 9),
        new MGL.MeshLambertMaterial({ color: towelColors[i % towelColors.length] })
      );
      canopy.position.set(x + 0.16, 2.35, z);
      canopy.rotation.z = 0.14;
      this.group.add(canopy);
      // Towel.
      const towel = box(1.1, 0.05, 2.1, towelColors[(i + 3) % towelColors.length], x + 0.8, 0.06, z + 0.4, ry);
      this.group.add(towel);
      // Sunbather on most towels: a lying figure, torso and head.
      if (rng() < 0.72) {
        const skin = skinTones[Math.floor(rng() * skinTones.length)];
        const body = box(0.5, 0.16, 1.5, skin, x + 0.8, 0.16, z + 0.35, ry);
        this.group.add(body);
        const head = new MGL.Mesh(
          new MGL.SphereGeometry(0.21, 8, 6),
          new MGL.MeshLambertMaterial({ color: skin })
        );
        const hx = x + 0.8 + Math.sin(ry) * 0.95, hz = z + 0.35 + Math.cos(ry) * 0.95;
        head.position.set(hx, 0.2, hz);
        this.group.add(head);
      }
      // Occasional beach ball.
      if (rng() < 0.4) {
        const ball = new MGL.Mesh(
          new MGL.SphereGeometry(0.32, 10, 8),
          new MGL.MeshLambertMaterial({ color: towelColors[Math.floor(rng() * towelColors.length)] })
        );
        ball.position.set(x - 1.3, 0.32, z + 1.1);
        this.group.add(ball);
      }
    }
    // Lifeguard stands used by the Beach Courier mission.
    this.lifeguards = [];
    for (const gx of [-140, -45, 50, 145]) {
      const stand = new MGL.Group();
      const legs = box(1.6, 2.4, 1.6, 0xf5f5f5, 0, 1.2, 0);
      const hut = box(2.0, 1.4, 2.0, 0xe74c3c, 0, 3.1, 0);
      stand.add(legs, hut);
      stand.position.set(gx, 0, WORLD.beachZ + 2);
      this.group.add(stand);
      this.lifeguards.push({ x: gx, z: WORLD.beachZ + 2 });
      this.addCollider(gx, WORLD.beachZ + 2, 1.1, 1.1);
    }
  }

  buildPort(rng) {
    const crateColors = [0xb5651d, 0x707a8a, 0x4a7c59, 0x94524a];
    for (let i = 0; i < 22; i++) {
      const x = 158 + rng() * 26;
      const z = -140 + rng() * 250;
      if (WORLD.roadsZ.some((rz) => Math.abs(z - rz) < 9)) continue;
      const s = 2.4 + rng() * 2;
      const crate = box(s, s, s, crateColors[i % crateColors.length], x, s / 2, z, rng() * 0.6);
      this.group.add(crate);
      this.addCollider(x, z, s / 2, s / 2);
    }
    // Two dock cranes.
    for (const cz of [-70, 55]) {
      const base = box(2, 15, 2, 0xd35400, 172, 7.5, cz);
      const arm = box(20, 1.4, 1.4, 0xd35400, 163, 15, cz);
      this.group.add(base, arm);
      this.addCollider(172, cz, 1.4, 1.4);
    }
  }

  buildSign() {
    if (!this.tallest) return;
    const { x, z, h, w } = this.tallest;
    const board = new MGL.Mesh(
      new MGL.BoxGeometry(Math.min(w * 1.7, 30), 5.6, 0.8),
      new MGL.MeshLambertMaterial({ color: 0x2a1450 })
    );
    // South edge of the roof, facing Ocean Drive and the sea.
    board.position.set(x, h + 3.4, z + w / 2 + 0.6);
    this.group.add(board);
    const face = new MGL.Mesh(
      new MGL.PlaneGeometry(Math.min(w * 1.66, 29), 5.2),
      new MGL.MeshBasicMaterial({ map: makeSignTexture() })
    );
    face.position.set(x, h + 3.4, z + w / 2 + 1.05);
    this.group.add(face);
    for (const sx of [-0.35, 0.35]) {
      const strut = box(0.5, 3.2, 0.5, 0x555a66, x + sx * w, h + 1.2, z + w / 2 + 0.6);
      this.group.add(strut);
    }
  }

  // Resolve a circle (x,z,r) against every building collider.
  collide(x, z, r) {
    let nx = x, nz = z, hit = false;
    for (const c of this.colliders) {
      const dx = Math.max(c.minX - nx, 0, nx - c.maxX);
      const dz = Math.max(c.minZ - nz, 0, nz - c.maxZ);
      if (dx * dx + dz * dz < r * r) {
        hit = true;
        // Push out along the shallower penetration axis.
        const pushLeft = nx - (c.minX - r), pushRight = (c.maxX + r) - nx;
        const pushNear = nz - (c.minZ - r), pushFar = (c.maxZ + r) - nz;
        const m = Math.min(pushLeft, pushRight, pushNear, pushFar);
        if (m === pushLeft) nx = c.minX - r;
        else if (m === pushRight) nx = c.maxX + r;
        else if (m === pushNear) nz = c.minZ - r;
        else nz = c.maxZ + r;
      }
    }
    return { x: nx, z: nz, hit };
  }

  update(t) {
    if (this.water) this.water.position.y = 0.06 + Math.sin(t * 0.7) * 0.03;
  }
}
