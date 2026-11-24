// minigl.js - a tiny hand-written WebGL1 renderer for SOLMAR HEAT.
//
// This file replaces a full 3D library with just the slice of scene-graph
// behaviour the game actually uses: a tree of objects with position /
// rotation / scale, a handful of primitive geometries, canvas textures,
// two material flavours (flat and lambert), one hemisphere light plus one
// directional light, linear fog, and a perspective camera. Everything is
// plain WebGL1 with a single shader program, so the game stays fully
// self-contained and works offline with no external code at all.
//
// Conventions used throughout:
//   - Matrices are Float32Array(16) in column-major order (WebGL style).
//   - Euler rotation order is XYZ, i.e. R = Rx * Ry * Rz.
//   - Geometry index buffers may be Uint32; the renderer asks for the
//     OES_element_index_uint extension and falls back to Uint16 when a
//     geometry is small enough.

// ---------------------------------------------------------------------------
// Constants (numeric values only need to be distinct, but these mirror the
// familiar ones so debugging output reads sensibly).

export const FrontSide = 0;
export const BackSide = 1;
export const DoubleSide = 2;

export const ClampToEdgeWrapping = 1001;
export const RepeatWrapping = 1000;

// ---------------------------------------------------------------------------
// Small math helpers.

function matIdentity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

// out = a * b (both column-major).
function matMultiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

// Rotation matrix (3x3 packed into a 4x4) for Euler XYZ: R = Rx * Ry * Rz.
function matFromEulerXYZ(x, y, z) {
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  const m = matIdentity();
  // Row-major view of the rotation (transposed below into column-major):
  //   [ cy*cz,            -cy*sz,             sy      ]
  //   [ cx*sz + sx*sy*cz,  cx*cz - sx*sy*sz, -sx*cy   ]
  //   [ sx*sz - cx*sy*cz,  sx*cz + cx*sy*sz,  cx*cy   ]
  m[0] = cy * cz; m[4] = -cy * sz; m[8] = sy;
  m[1] = cx * sz + sx * sy * cz; m[5] = cx * cz - sx * sy * sz; m[9] = -sx * cy;
  m[2] = sx * sz - cx * sy * cz; m[6] = sx * cz + cx * sy * sz; m[10] = cx * cy;
  return m;
}

// Quaternion (x, y, z, w) from a pure-rotation 4x4 column-major matrix.
function quatFromMat(m) {
  const r00 = m[0], r10 = m[1], r20 = m[2];
  const r01 = m[4], r11 = m[5], r21 = m[6];
  const r02 = m[8], r12 = m[9], r22 = m[10];
  const trace = r00 + r11 + r22;
  let x, y, z, w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = s / 4; x = (r21 - r12) / s; y = (r02 - r20) / s; z = (r10 - r01) / s;
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
    w = (r21 - r12) / s; x = s / 4; y = (r01 + r10) / s; z = (r02 + r20) / s;
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    w = (r02 - r20) / s; x = (r01 + r10) / s; y = s / 4; z = (r12 + r21) / s;
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    w = (r10 - r01) / s; x = (r02 + r20) / s; y = (r12 + r21) / s; z = s / 4;
  }
  return { x, y, z, w };
}

function matFromQuat(q) {
  const { x, y, z, w } = q;
  const m = matIdentity();
  m[0] = 1 - 2 * (y * y + z * z); m[4] = 2 * (x * y - z * w); m[8] = 2 * (x * z + y * w);
  m[1] = 2 * (x * y + z * w); m[5] = 1 - 2 * (x * x + z * z); m[9] = 2 * (y * z - x * w);
  m[2] = 2 * (x * z - y * w); m[6] = 2 * (y * z + x * w); m[10] = 1 - 2 * (x * x + y * y);
  return m;
}

function hexToRgb(hex) {
  const n = typeof hex === 'number' ? hex : 0xffffff;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---------------------------------------------------------------------------
// Vector3: a plain {x, y, z} with the few verbs the game calls. Object
// positions and scales are Vector3 instances too, so direct field writes
// such as `mesh.position.x = 4` behave exactly as expected.

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
  }

  set(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    return this;
  }

  copy(v) {
    this.x = v.x; this.y = v.y; this.z = v.z;
    return this;
  }

  lerp(v, t) {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }
}

// Euler angles with a set() verb; the renderer reads the fields directly.
class Euler {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
  }

  set(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    return this;
  }
}

// ---------------------------------------------------------------------------
// Object3D: the scene-graph node everything else extends.

export class Object3D {
  constructor() {
    this.position = new Vector3(0, 0, 0);
    this.rotation = new Euler(0, 0, 0);
    this.scale = new Vector3(1, 1, 1);
    this.children = [];
    this.parent = null;
    this.userData = {};
    this.visible = true;
    this._lookQuat = null; // set by lookAt(); see the note there
  }

  add(...objs) {
    for (const obj of objs) {
      if (!obj || obj === this) continue;
      if (obj.parent) obj.parent.remove(obj);
      obj.parent = this;
      this.children.push(obj);
    }
    return this;
  }

  remove(obj) {
    const i = this.children.indexOf(obj);
    if (i >= 0) {
      this.children.splice(i, 1);
      obj.parent = null;
    }
    return this;
  }

  // Face a point given as 3 numbers. Cameras look down their -Z axis,
  // every other object faces the point with its +Z axis; up is +Y.
  // The game never mixes lookAt with euler rotation on the same object,
  // so storing the resulting orientation as a quaternion is safe: the
  // local matrix uses it instead of the (untouched) euler angles.
  lookAt(x, y, z) {
    const px = this.position.x, py = this.position.y, pz = this.position.z;
    let zx = px - x, zy = py - y, zz = pz - z; // camera convention first
    if (!this.isCamera) { zx = -zx; zy = -zy; zz = -zz; }
    let len = Math.hypot(zx, zy, zz);
    if (len < 1e-9) return;
    zx /= len; zy /= len; zz /= len;
    // x axis = normalize(cross(up, z)) = normalize((z.z, 0, -z.x));
    // guard the straight-up case where that cross product vanishes.
    let xx = zz;
    let xy = 0;
    let xz = -zx;
    len = Math.hypot(xx, xy, xz);
    if (len < 1e-9) { xx = 1; xy = 0; xz = 0; len = 1; }
    xx /= len; xy /= len; xz /= len;
    // y axis = cross(z, x)
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    const m = matIdentity();
    m[0] = xx; m[1] = xy; m[2] = xz;
    m[4] = yx; m[5] = yy; m[6] = yz;
    m[8] = zx; m[9] = zy; m[10] = zz;
    this._lookQuat = quatFromMat(m);
  }

  // Local matrix: T * R * S, with R from lookAt's quaternion when present.
  localMatrix() {
    const rot = this._lookQuat
      ? matFromQuat(this._lookQuat)
      : matFromEulerXYZ(this.rotation.x, this.rotation.y, this.rotation.z);
    rot[0] *= this.scale.x; rot[1] *= this.scale.x; rot[2] *= this.scale.x;
    rot[4] *= this.scale.y; rot[5] *= this.scale.y; rot[6] *= this.scale.y;
    rot[8] *= this.scale.z; rot[9] *= this.scale.z; rot[10] *= this.scale.z;
    rot[12] = this.position.x; rot[13] = this.position.y; rot[14] = this.position.z;
    return rot;
  }
}

// ---------------------------------------------------------------------------
// Clock: delta seconds between calls plus a running total.

export class Clock {
  constructor() {
    this.elapsedTime = 0;
    this._last = null;
  }

  getDelta() {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    if (this._last === null) {
      this._last = now;
      return 0;
    }
    const dt = now - this._last;
    this._last = now;
    this.elapsedTime += dt;
    return dt;
  }
}

// ---------------------------------------------------------------------------
// Scene, fog, groups, meshes, lights, camera.

export class Fog {
  constructor(color = 0x000000, near = 1, far = 1000) {
    this.color = color;
    this.near = near;
    this.far = far;
  }
}

export class Scene extends Object3D {
  constructor() {
    super();
    this.fog = null;
    this.isScene = true;
  }
}

export class Group extends Object3D {}

export class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
    this.isMesh = true;
  }
}

export class HemisphereLight extends Object3D {
  constructor(skyColor = 0xffffff, groundColor = 0x000000, intensity = 1) {
    super();
    this.skyColor = skyColor;
    this.groundColor = groundColor;
    this.intensity = intensity;
    this.isHemisphereLight = true;
  }
}

export class DirectionalLight extends Object3D {
  constructor(color = 0xffffff, intensity = 1) {
    super();
    this.color = color;
    this.intensity = intensity;
    this.isDirectionalLight = true;
  }
}

export class PerspectiveCamera extends Object3D {
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.isCamera = true;
    this.projectionMatrix = matIdentity();
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    const f = 1 / Math.tan((this.fov * Math.PI / 180) / 2);
    const m = new Float32Array(16);
    m[0] = f / this.aspect;
    m[5] = f;
    m[10] = (this.far + this.near) / (this.near - this.far);
    m[11] = -1;
    m[14] = (2 * this.far * this.near) / (this.near - this.far);
    this.projectionMatrix = m;
  }
}

// ---------------------------------------------------------------------------
// Materials.

class Material {
  constructor(params = {}, lambert) {
    this.color = params.color !== undefined ? params.color : 0xffffff;
    this.map = params.map || null;
    this.side = params.side !== undefined ? params.side : FrontSide;
    this.fog = params.fog !== undefined ? params.fog : true;
    this.transparent = params.transparent === true;
    this.opacity = params.opacity !== undefined ? params.opacity : 1;
    this.depthWrite = params.depthWrite !== undefined ? params.depthWrite : true;
    this.isLambert = lambert;
  }
}

export class MeshBasicMaterial extends Material {
  constructor(params = {}) { super(params, false); }
}

export class MeshLambertMaterial extends Material {
  constructor(params = {}) { super(params, true); }
}

// ---------------------------------------------------------------------------
// CanvasTexture: wraps a canvas; uploads lazily on first draw.

export class CanvasTexture {
  constructor(canvas) {
    this.image = canvas;
    this.wrapS = ClampToEdgeWrapping;
    this.wrapT = ClampToEdgeWrapping;
    this.repeat = new Vector3(1, 1, 1); // only x/y are used, as uv scale
    this.anisotropy = 1; // accepted for compatibility; not applied
  }
}

// ---------------------------------------------------------------------------
// Geometries. Each builds plain position / normal / uv / index arrays with
// outward-facing counter-clockwise winding.

class Geometry {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
  }

  vert(x, y, z, nx, ny, nz, u, v) {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    return this.positions.length / 3 - 1;
  }

  tri(a, b, c) {
    this.indices.push(a, b, c);
  }

  finish() {
    this.positionArray = new Float32Array(this.positions);
    this.normalArray = new Float32Array(this.normals);
    this.uvArray = new Float32Array(this.uvs);
    let max = 0;
    for (const i of this.indices) if (i > max) max = i;
    this.indexArray = max > 65535
      ? new Uint32Array(this.indices)
      : new Uint16Array(this.indices);
    this.positions = this.normals = this.uvs = this.indices = null;
    return this;
  }
}

export class BoxGeometry extends Geometry {
  constructor(w = 1, h = 1, d = 1) {
    super();
    // One quad per face. For each face, u and v are unit axes spanning the
    // face chosen so that cross(u, v) is the outward normal; the quad is
    // emitted a-b-c / a-c-d, which is counter-clockwise seen from outside.
    const faces = [
      { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], c: [w / 2, 0, 0], hu: d / 2, hv: h / 2 },
      { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], c: [-w / 2, 0, 0], hu: d / 2, hv: h / 2 },
      { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], c: [0, h / 2, 0], hu: w / 2, hv: d / 2 },
      { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], c: [0, -h / 2, 0], hu: w / 2, hv: d / 2 },
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], c: [0, 0, d / 2], hu: w / 2, hv: h / 2 },
      { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], c: [0, 0, -d / 2], hu: w / 2, hv: h / 2 },
    ];
    for (const f of faces) {
      const corner = (su, sv, uu, vv) => this.vert(
        f.c[0] + f.u[0] * su * f.hu + f.v[0] * sv * f.hv,
        f.c[1] + f.u[1] * su * f.hu + f.v[1] * sv * f.hv,
        f.c[2] + f.u[2] * su * f.hu + f.v[2] * sv * f.hv,
        f.n[0], f.n[1], f.n[2], uu, vv);
      const a = corner(-1, -1, 0, 0);
      const b = corner(1, -1, 1, 0);
      const c = corner(1, 1, 1, 1);
      const dd = corner(-1, 1, 0, 1);
      this.tri(a, b, c);
      this.tri(a, c, dd);
    }
    this.finish();
  }
}

export class PlaneGeometry extends Geometry {
  constructor(w = 1, h = 1) {
    super();
    const a = this.vert(-w / 2, -h / 2, 0, 0, 0, 1, 0, 0);
    const b = this.vert(w / 2, -h / 2, 0, 0, 0, 1, 1, 0);
    const c = this.vert(w / 2, h / 2, 0, 0, 0, 1, 1, 1);
    const d = this.vert(-w / 2, h / 2, 0, 0, 0, 1, 0, 1);
    this.tri(a, b, c);
    this.tri(a, c, d);
    this.finish();
  }
}

export class SphereGeometry extends Geometry {
  constructor(r = 1, widthSeg = 12, heightSeg = 8) {
    super();
    const ws = Math.max(3, Math.floor(widthSeg));
    const hs = Math.max(2, Math.floor(heightSeg));
    for (let iy = 0; iy <= hs; iy += 1) {
      const theta = (iy / hs) * Math.PI; // 0 at the top pole
      const sinT = Math.sin(theta), cosT = Math.cos(theta);
      for (let ix = 0; ix <= ws; ix += 1) {
        const phi = (ix / ws) * Math.PI * 2;
        const x = r * sinT * Math.cos(phi);
        const y = r * cosT;
        const z = r * sinT * Math.sin(phi);
        this.vert(x, y, z, x / r, y / r, z / r, ix / ws, 1 - iy / hs);
      }
    }
    for (let iy = 0; iy < hs; iy += 1) {
      for (let ix = 0; ix < ws; ix += 1) {
        const a = iy * (ws + 1) + ix;
        const b = a + ws + 1;
        const c = b + 1;
        const d = a + 1;
        this.tri(a, d, b);
        this.tri(b, d, c);
      }
    }
    this.finish();
  }
}

export class CircleGeometry extends Geometry {
  constructor(r = 1, segments = 16) {
    super();
    const seg = Math.max(3, Math.floor(segments));
    const centre = this.vert(0, 0, 0, 0, 0, 1, 0.5, 0.5);
    for (let i = 0; i <= seg; i += 1) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      this.vert(x, y, 0, 0, 0, 1, x / (2 * r) + 0.5, y / (2 * r) + 0.5);
    }
    for (let i = 0; i < seg; i += 1) this.tri(centre, 1 + i, 2 + i);
    this.finish();
  }
}

export class CylinderGeometry extends Geometry {
  constructor(radiusTop = 1, radiusBottom = 1, height = 1,
    radialSegments = 12, heightSegments = 1, openEnded = false) {
    super();
    const rs = Math.max(3, Math.floor(radialSegments));
    const hs = Math.max(1, Math.floor(heightSegments));
    // Side wall: rows from the top rim down to the bottom rim. The normal
    // tilts for a tapered wall, following the wall's slope.
    const slope = (radiusBottom - radiusTop) / height;
    for (let iy = 0; iy <= hs; iy += 1) {
      const t = iy / hs;
      const rad = radiusTop + (radiusBottom - radiusTop) * t;
      const y = height / 2 - t * height;
      for (let ix = 0; ix <= rs; ix += 1) {
        const phi = (ix / rs) * Math.PI * 2;
        const cx = Math.cos(phi), sz = Math.sin(phi);
        let nx = cx, ny = slope, nz = sz;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        this.vert(rad * cx, y, rad * sz, nx, ny, nz, ix / rs, 1 - t);
      }
    }
    for (let iy = 0; iy < hs; iy += 1) {
      for (let ix = 0; ix < rs; ix += 1) {
        const a = iy * (rs + 1) + ix;
        const b = a + rs + 1;
        const c = b + 1;
        const d = a + 1;
        this.tri(a, d, b);
        this.tri(b, d, c);
      }
    }
    if (!openEnded) {
      this._cap(radiusTop, height / 2, 1, rs);
      this._cap(radiusBottom, -height / 2, -1, rs);
    }
    this.finish();
  }

  // Flat cap fan. `dir` is +1 for the top (facing +Y) and -1 for the base.
  _cap(radius, y, dir, rs) {
    if (radius <= 0) return;
    const centre = this.vert(0, y, 0, 0, dir, 0, 0.5, 0.5);
    const ringStart = this.positions.length / 3;
    for (let i = 0; i <= rs; i += 1) {
      const phi = (i / rs) * Math.PI * 2;
      const x = Math.cos(phi) * radius, z = Math.sin(phi) * radius;
      this.vert(x, y, z, 0, dir, 0, x / (2 * radius) + 0.5, z / (2 * radius) + 0.5);
    }
    for (let i = 0; i < rs; i += 1) {
      if (dir > 0) this.tri(centre, ringStart + i + 1, ringStart + i);
      else this.tri(centre, ringStart + i, ringStart + i + 1);
    }
  }
}

export class ConeGeometry extends Geometry {
  constructor(radius = 1, height = 1, radialSegments = 12) {
    super();
    const rs = Math.max(3, Math.floor(radialSegments));
    // Side: one apex vertex per segment (so each face gets the slant
    // normal at its mid-angle) plus the base ring. The side normal of a
    // cone points outward and up, proportional to (h*cos, r, h*sin).
    const baseStart = 0;
    for (let i = 0; i <= rs; i += 1) {
      const phi = (i / rs) * Math.PI * 2;
      const cx = Math.cos(phi), sz = Math.sin(phi);
      let nx = height * cx, ny = radius, nz = height * sz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      this.vert(radius * cx, -height / 2, radius * sz,
        nx / nl, ny / nl, nz / nl, i / rs, 0);
    }
    for (let i = 0; i < rs; i += 1) {
      const mid = ((i + 0.5) / rs) * Math.PI * 2;
      const cx = Math.cos(mid), sz = Math.sin(mid);
      let nx = height * cx, ny = radius, nz = height * sz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const apex = this.vert(0, height / 2, 0, nx / nl, ny / nl, nz / nl,
        (i + 0.5) / rs, 1);
      this.tri(apex, baseStart + i + 1, baseStart + i);
    }
    // Base cap, facing -Y.
    const centre = this.vert(0, -height / 2, 0, 0, -1, 0, 0.5, 0.5);
    const ringStart = this.positions.length / 3;
    for (let i = 0; i <= rs; i += 1) {
      const phi = (i / rs) * Math.PI * 2;
      const x = Math.cos(phi) * radius, z = Math.sin(phi) * radius;
      this.vert(x, -height / 2, z, 0, -1, 0,
        x / (2 * radius) + 0.5, z / (2 * radius) + 0.5);
    }
    for (let i = 0; i < rs; i += 1) this.tri(centre, ringStart + i, ringStart + i + 1);
    this.finish();
  }
}

export class TorusGeometry extends Geometry {
  constructor(radius = 1, tube = 0.4, radialSegments = 8, tubularSegments = 16) {
    super();
    const rad = Math.max(3, Math.floor(radialSegments)); // around the tube
    const tub = Math.max(3, Math.floor(tubularSegments)); // around the ring
    for (let j = 0; j <= rad; j += 1) {
      const v = (j / rad) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      for (let i = 0; i <= tub; i += 1) {
        const u = (i / tub) * Math.PI * 2;
        const cu = Math.cos(u), su = Math.sin(u);
        const nx = cv * cu, ny = cv * su, nz = sv;
        this.vert(
          (radius + tube * cv) * cu,
          (radius + tube * cv) * su,
          tube * sv,
          nx, ny, nz, i / tub, j / rad);
      }
    }
    for (let j = 0; j < rad; j += 1) {
      for (let i = 0; i < tub; i += 1) {
        const a = j * (tub + 1) + i;
        const b = a + tub + 1;
        const c = b + 1;
        const d = a + 1;
        this.tri(a, d, b);
        this.tri(b, d, c);
      }
    }
    this.finish();
  }
}

// ---------------------------------------------------------------------------
// WebGLRenderer: one shader program does everything. Lambert materials get
// hemisphere + directional shading; basic materials are drawn unlit; fog
// is a smoothstep over view depth mixed toward the scene fog colour.

const VERT_SRC = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uRepeat;
varying vec3 vNormal;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vNormal = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNormal;
  vUv = aUv * uRepeat;
  vec4 view = uView * world;
  vDepth = -view.z;
  gl_Position = uProj * view;
}
`;

const FRAG_SRC = `
precision mediump float;
uniform vec3 uColor;
uniform sampler2D uMap;
uniform bool uHasMap;
uniform bool uLambert;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform float uHemiInt;
uniform vec3 uDirColor;
uniform float uDirInt;
uniform vec3 uDirToLight;
uniform bool uFogOn;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOpacity;
varying vec3 vNormal;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec4 base = vec4(uColor, 1.0);
  if (uHasMap) base = base * texture2D(uMap, vUv);
  vec3 col = base.rgb;
  if (uLambert) {
    vec3 n = normalize(vNormal);
    float hemiMix = n.y * 0.5 + 0.5;
    vec3 light = mix(uHemiGround, uHemiSky, hemiMix) * uHemiInt
      + uDirColor * uDirInt * max(dot(n, uDirToLight), 0.0);
    col = col * light;
  }
  if (uFogOn) {
    float f = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, f);
  }
  gl_FragColor = vec4(col, base.a * uOpacity);
}
`;

export class WebGLRenderer {
  constructor({ canvas, antialias = false } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: !!antialias, alpha: false })
      || canvas.getContext('experimental-webgl', { antialias: !!antialias, alpha: false });
    if (!gl) throw new Error('minigl: WebGL is not available');
    this.gl = gl;
    this._uintExt = gl.getExtension('OES_element_index_uint');
    this._pixelRatio = 1;
    this._geoCache = new WeakMap();
    this._texCache = new WeakMap();
    this._program = this._buildProgram();
    this._attribs = {
      position: gl.getAttribLocation(this._program, 'aPosition'),
      normal: gl.getAttribLocation(this._program, 'aNormal'),
      uv: gl.getAttribLocation(this._program, 'aUv'),
    };
    this._uniforms = {};
    const names = ['uModel', 'uView', 'uProj', 'uRepeat', 'uColor', 'uMap',
      'uHasMap', 'uLambert', 'uHemiSky', 'uHemiGround', 'uHemiInt',
      'uDirColor', 'uDirInt', 'uDirToLight', 'uFogOn', 'uFogColor',
      'uFogNear', 'uFogFar', 'uOpacity'];
    for (const name of names) this._uniforms[name] = gl.getUniformLocation(this._program, name);
  }

  _buildProgram() {
    const gl = this.gl;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('minigl shader: ' + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('minigl link: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  setPixelRatio(r) {
    this._pixelRatio = r || 1;
  }

  setSize(w, h) {
    const canvas = this.canvas;
    canvas.width = Math.round(w * this._pixelRatio);
    canvas.height = Math.round(h * this._pixelRatio);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  _buffersFor(geometry) {
    let entry = this._geoCache.get(geometry);
    if (entry) return entry;
    const gl = this.gl;
    const make = (data) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return buf;
    };
    const indexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indexArray, gl.STATIC_DRAW);
    entry = {
      position: make(geometry.positionArray),
      normal: make(geometry.normalArray),
      uv: make(geometry.uvArray),
      index: indexBuf,
      count: geometry.indexArray.length,
      indexType: geometry.indexArray instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
    this._geoCache.set(geometry, entry);
    return entry;
  }

  _textureFor(texture) {
    let entry = this._texCache.get(texture);
    if (entry) return entry;
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
    const wrap = (mode) => (mode === RepeatWrapping ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap(texture.wrapS));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap(texture.wrapT));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    entry = { tex };
    this._texCache.set(texture, entry);
    return entry;
  }

  render(scene, camera) {
    const gl = this.gl;
    const fog = scene.fog || null;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const clear = fog ? hexToRgb(fog.color) : [0, 0, 0];
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(this._program);

    // Camera view matrix: the inverse of its world transform. The camera
    // is not part of the scene graph, so its world transform is its own.
    const camWorld = camera.localMatrix();
    const view = this._invertRigid(camWorld);

    // Walk the graph once: world matrices down the tree, an invisible
    // parent hides its whole subtree. Collect meshes and lights. The
    // game uses exactly one hemisphere and one directional light; the
    // first of each kind found wins.
    const opaque = [];
    const transparent = [];
    let hemi = null;
    let dir = null;
    const camPos = [camWorld[12], camWorld[13], camWorld[14]];
    const walk = (node, parentMat, parentVisible) => {
      const visible = parentVisible && node.visible !== false;
      const world = matMultiply(parentMat, node.localMatrix());
      if (node.isHemisphereLight && !hemi) hemi = node;
      if (node.isDirectionalLight && !dir) dir = node;
      if (visible && node.isMesh && node.geometry && node.material) {
        const item = {
          mesh: node,
          world,
          dist: Math.hypot(world[12] - camPos[0], world[13] - camPos[1], world[14] - camPos[2]),
        };
        if (node.material.transparent) transparent.push(item);
        else opaque.push(item);
      }
      for (const child of node.children) walk(child, world, visible);
    };
    walk(scene, matIdentity(), true);
    transparent.sort((a, b) => b.dist - a.dist);

    // Shared uniforms for this frame.
    const u = this._uniforms;
    gl.uniformMatrix4fv(u.uView, false, view);
    gl.uniformMatrix4fv(u.uProj, false, camera.projectionMatrix);
    const hemiSky = hemi ? hexToRgb(hemi.skyColor) : [1, 1, 1];
    const hemiGround = hemi ? hexToRgb(hemi.groundColor) : [0, 0, 0];
    gl.uniform3fv(u.uHemiSky, hemiSky);
    gl.uniform3fv(u.uHemiGround, hemiGround);
    gl.uniform1f(u.uHemiInt, hemi ? hemi.intensity : 0);
    const dirColor = dir ? hexToRgb(dir.color) : [0, 0, 0];
    gl.uniform3fv(u.uDirColor, dirColor);
    gl.uniform1f(u.uDirInt, dir ? dir.intensity : 0);
    // Directional light: direction is from the light's position toward
    // the origin, so the vector toward the light is its position,
    // normalised (the light hangs off the scene root in this game).
    let toLight = [0, 1, 0];
    if (dir) {
      const p = dir.position;
      const l = Math.hypot(p.x, p.y, p.z);
      if (l > 1e-9) toLight = [p.x / l, p.y / l, p.z / l];
    }
    gl.uniform3fv(u.uDirToLight, toLight);
    if (fog) {
      gl.uniform3fv(u.uFogColor, hexToRgb(fog.color));
      gl.uniform1f(u.uFogNear, fog.near);
      gl.uniform1f(u.uFogFar, fog.far);
    }

    for (const item of opaque.concat(transparent)) this._draw(item, fog);
  }

  // Inverse of a rigid (rotation + translation, unit scale) matrix.
  _invertRigid(m) {
    const out = matIdentity();
    // Transpose the rotation part.
    out[0] = m[0]; out[4] = m[1]; out[8] = m[2];
    out[1] = m[4]; out[5] = m[5]; out[9] = m[6];
    out[2] = m[8]; out[6] = m[9]; out[10] = m[10];
    const tx = m[12], ty = m[13], tz = m[14];
    out[12] = -(out[0] * tx + out[4] * ty + out[8] * tz);
    out[13] = -(out[1] * tx + out[5] * ty + out[9] * tz);
    out[14] = -(out[2] * tx + out[6] * ty + out[10] * tz);
    return out;
  }

  _draw(item, fog) {
    const gl = this.gl;
    const u = this._uniforms;
    const mesh = item.mesh;
    const mat = mesh.material;
    const bufs = this._buffersFor(mesh.geometry);

    gl.uniformMatrix4fv(u.uModel, false, item.world);
    const rgb = hexToRgb(mat.color);
    gl.uniform3f(u.uColor, rgb[0], rgb[1], rgb[2]);
    gl.uniform1f(u.uOpacity, mat.opacity);
    gl.uniform1i(u.uLambert, mat.isLambert ? 1 : 0);
    gl.uniform1i(u.uFogOn, fog && mat.fog !== false ? 1 : 0);

    if (mat.map) {
      const entry = this._textureFor(mat.map);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      gl.uniform1i(u.uMap, 0);
      gl.uniform1i(u.uHasMap, 1);
      gl.uniform2f(u.uRepeat, mat.map.repeat.x, mat.map.repeat.y);
    } else {
      gl.uniform1i(u.uHasMap, 0);
      gl.uniform2f(u.uRepeat, 1, 1);
    }

    // Face culling per material side.
    if (mat.side === DoubleSide) {
      gl.disable(gl.CULL_FACE);
    } else {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(mat.side === BackSide ? gl.FRONT : gl.BACK);
    }
    gl.depthMask(mat.depthWrite !== false);
    if (mat.transparent) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.disable(gl.BLEND);
    }

    const bind = (buf, loc, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    bind(bufs.position, this._attribs.position, 3);
    bind(bufs.normal, this._attribs.normal, 3);
    bind(bufs.uv, this._attribs.uv, 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.index);
    gl.drawElements(gl.TRIANGLES, bufs.count, bufs.indexType, 0);
  }
}
