// SOLMAR HEAT - the five-mission story chain. Each mission is a list
// of steps; a step is a drive-to / reach marker, a timed leg, or a
// condition (be in a car, lose the police). Markers render as a pillar
// of gold light so they read from across the bay.

import * as MGL from './minigl.js';
import { STORY, WORLD } from './config.js';

function markerMesh() {
  const group = new MGL.Group();
  const pillar = new MGL.Mesh(
    new MGL.CylinderGeometry(2.6, 2.6, 26, 18, 1, true),
    new MGL.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0.35,
      side: MGL.DoubleSide, depthWrite: false,
    })
  );
  pillar.position.y = 13;
  group.add(pillar);
  const ring = new MGL.Mesh(
    new MGL.TorusGeometry(2.6, 0.18, 8, 28),
    new MGL.MeshBasicMaterial({ color: 0xffe9a3 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  group.add(ring);
  group.userData.ring = ring;
  return group;
}

// Step factories keep the story table below readable.
const goTo = (x, z, label, r = 7) => ({ kind: 'goto', x, z, label, r });
const driveTo = (x, z, label, r = 8) => ({ kind: 'drive', x, z, label, r });

export const MISSION_STEPS = [
  // 1. First Wheels
  [
    goTo(-4, 148, 'Reach the teal coupe at the beach lot'),
    driveTo(30, 108, 'Drive to the Solmar Grand Hotel'),
  ],
  // 2. Port Run (timed once you roll)
  [
    goTo(150, 96, 'Reach the port gates'),
    driveTo(-30, -48, 'Deliver the crate to the Centro tower garage', 9),
  ],
  // 3. Cool Off
  [
    { kind: 'evade', label: 'Lose the police - break sight and stay clean' },
  ],
  // 4. Beach Courier
  [
    driveTo(-140, WORLD.beachZ, 'Lifeguard stand 1 - west end', 9),
    driveTo(-45, WORLD.beachZ, 'Lifeguard stand 2', 9),
    driveTo(50, WORLD.beachZ, 'Lifeguard stand 3', 9),
    driveTo(145, WORLD.beachZ, 'Lifeguard stand 4 - east end', 9),
  ],
  // 5. Golden Hour
  [
    goTo(150, -96, 'Reach the gold convertible at the port'),
    driveTo(-30, 12, 'Bring the gold car to the Centro tower', 10),
  ],
];

export const MISSION_TIMERS = { 1: 150, 3: 170 }; // mission index -> seconds

export class MissionDirector {
  constructor(scene, hooks) {
    this.hooks = hooks; // {onComplete(mission), onStep(label), crime(n)}
    this.index = 0;     // current mission in STORY
    this.step = 0;
    this.active = false;
    this.done = false;
    this.timer = null;
    this.marker = markerMesh();
    this.marker.visible = false;
    scene.add(this.marker);
  }

  current() { return this.done ? null : STORY[this.index]; }
  currentStep() {
    if (this.done || !this.active) return null;
    return MISSION_STEPS[this.index][this.step];
  }

  start(index) {
    this.index = index;
    this.step = 0;
    this.active = true;
    this.timer = MISSION_TIMERS[index] !== undefined ? MISSION_TIMERS[index] : null;
    const m = STORY[index];
    if (index === 2) this.hooks.crime(3); // Cool Off starts hot
    if (index === 4) this.hooks.crime(2); // Golden Hour draws eyes
    this.placeMarker();
    this.hooks.onStep(m.intro);
  }

  placeMarker() {
    const s = this.currentStep();
    if (s && (s.kind === 'goto' || s.kind === 'drive')) {
      this.marker.visible = true;
      this.marker.position.set(s.x, 0, s.z);
    } else {
      this.marker.visible = false;
    }
  }

  // Called every frame with the player's state.
  update(dt, ctx) {
    if (!this.active || this.done) return;
    this.marker.userData.ring.rotation.z += dt * 1.4;
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = null;
        this.hooks.onStep('Out of time - the job resets. ' + STORY[this.index].intro);
        this.step = 0;
        this.timer = MISSION_TIMERS[this.index] !== undefined ? MISSION_TIMERS[this.index] : null;
        if (this.index === 2) this.hooks.crime(3);
        this.placeMarker();
        return;
      }
    }
    const s = this.currentStep();
    if (!s) return;
    const dist = Math.hypot(ctx.x - (s.x || 0), ctx.z - (s.z || 0));
    let complete = false;
    if (s.kind === 'goto') complete = !ctx.driving && dist < s.r || (ctx.driving && dist < s.r);
    if (s.kind === 'drive') complete = ctx.driving && dist < s.r;
    if (s.kind === 'evade') complete = ctx.stars === 0;
    if (complete) {
      this.step += 1;
      this.hooks.onPing();
      if (this.step >= MISSION_STEPS[this.index].length) {
        const finished = STORY[this.index];
        this.active = false;
        this.marker.visible = false;
        this.hooks.onComplete(finished);
        if (this.index + 1 < STORY.length) {
          // Next mission is offered, not forced; main starts it on key.
          this.index += 1;
          this.step = 0;
        } else {
          this.done = true;
        }
      } else {
        this.placeMarker();
        this.hooks.onStep(this.currentStep().label);
      }
    }
  }

  objectiveText() {
    if (this.done) return 'Story complete - Solmar Bay is yours. Free roam!';
    if (!this.active) {
      const m = this.current();
      return m ? `Press M to start: ${m.title}` : '';
    }
    const s = this.currentStep();
    let text = s ? s.label : '';
    if (this.timer !== null) text += `  (${Math.max(0, Math.ceil(this.timer))}s)`;
    return text;
  }
}
