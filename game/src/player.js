// SOLMAR HEAT - the player: Rico Vega, a wheelman new in Solmar Bay.
// On foot he walks and runs with a swinging low-poly figure; near a car
// he can get in and drive it, and get back out where he stands.

import { PLAYER } from './config.js';
import { buildFigure, poseFigure } from './peds.js';

export class Player {
  constructor(scene) {
    this.mesh = buildFigure(0xff5964, 0x22223b, 0xe0ac69); // coral shirt
    this.x = PLAYER.start.x;
    this.z = PLAYER.start.z;
    this.heading = PLAYER.start.heading;
    this.health = PLAYER.maxHealth;
    this.money = PLAYER.startMoney;
    this.phase = 0;
    this.driving = null;   // Car record while behind the wheel
    this.dead = false;
    scene.add(this.mesh);
    this.syncMesh();
  }

  get pos() { return this.driving ? { x: this.driving.x, z: this.driving.z } : { x: this.x, z: this.z }; }

  syncMesh() {
    if (this.driving) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // moveX/moveZ are a camera-relative wish direction in world space.
  update(dt, moveX, moveZ, running, city) {
    if (this.driving || this.dead) return;
    const len = Math.hypot(moveX, moveZ);
    if (len < 0.01) {
      poseFigure(this.mesh, 0, 0);
      return;
    }
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const ux = moveX / len, uz = moveZ / len;
    let nx = this.x + ux * speed * dt;
    let nz = this.z + uz * speed * dt;
    const res = city.collide(nx, nz, PLAYER.radius);
    nx = res.x; nz = res.z;
    this.x = nx; this.z = nz;
    this.heading = Math.atan2(ux, uz);
    this.phase += dt * speed * 1.6;
    poseFigure(this.mesh, this.phase, running ? 0.7 : 0.5);
    this.syncMesh();
  }

  enterCar(car) {
    this.driving = car;
    car.taken = true;
    this.syncMesh();
  }

  exitCar() {
    if (!this.driving) return null;
    const car = this.driving;
    car.taken = false;
    car.speed = 0;
    // Step out on the left side of the car.
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.x = car.x + side.x * 2.2;
    this.z = car.z + side.z * 2.2;
    this.heading = car.heading;
    this.driving = null;
    this.syncMesh();
    return car;
  }

  hurt(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.dead = true;
  }

  healFull() {
    this.health = PLAYER.maxHealth;
    this.dead = false;
  }
}
