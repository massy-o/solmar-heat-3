// SOLMAR HEAT - HUD: health, cash, wanted stars (which pulse when the
// heat rises), speed, the mission line, toasts, and the canvas minimap.
// All readouts are plain DOM elements updated in place, while the
// minimap is drawn each frame on a small 2D canvas.

import { WORLD } from './config.js';

export class Hud {
  constructor() {
    this.el = {
      health: document.getElementById('health-fill'),
      money: document.getElementById('money'),
      stars: document.getElementById('stars'),
      speed: document.getElementById('speed'),
      objective: document.getElementById('objective'),
      missionName: document.getElementById('mission-name'),
      toast: document.getElementById('toast'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.lastStars = -1;
  }

  pulseStars() {
    this.el.stars.classList.remove('pulse');
    void this.el.stars.offsetWidth; // restart the CSS animation
    this.el.stars.classList.add('pulse');
  }

  toast(text, ms = 3400) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  update(state) {
    const pct = Math.max(0, Math.min(100, state.health));
    this.el.health.style.width = pct + '%';
    this.el.health.style.background = pct < 30 ? '#e63946' : '#5ad66f';
    this.el.money.textContent = '$' + state.money.toLocaleString('en-US');
    if (state.stars !== this.lastStars) {
      this.lastStars = state.stars;
      this.el.stars.textContent = '★'.repeat(state.stars) + '☆'.repeat(5 - state.stars);
      this.el.stars.style.opacity = state.stars > 0 ? '1' : '0.35';
    }
    this.el.speed.textContent = state.driving
      ? Math.round(Math.abs(state.speed) * 3.6) + ' km/h'
      : '';
    this.el.objective.textContent = state.objective || '';
    this.el.missionName.textContent = state.missionName || '';
  }

  // Minimap: the whole bay squeezed onto a 184px canvas. North is up
  // (world -z), the beach is the pale strip at the bottom.
  drawMinimap(state) {
    const g = this.mapCtx;
    const S = 184;
    const px = (x) => ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * S;
    const pz = (z) => ((z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)) * S;
    g.fillStyle = '#7d8471';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#33343c';
    for (const z of WORLD.roadsZ) g.fillRect(0, pz(z) - 1.5, S, 3);
    for (const x of WORLD.roadsX) g.fillRect(px(x) - 1.5, 0, 3, S);
    g.fillRect(0, pz(144) - 2, S, 4); // Ocean Drive
    g.fillStyle = '#eed9a3';
    g.fillRect(0, pz(WORLD.beachZ), S, pz(WORLD.waterZ) - pz(WORLD.beachZ));
    g.fillStyle = '#2e7f9e';
    g.fillRect(0, pz(WORLD.waterZ), S, S - pz(WORLD.waterZ));
    // Traffic as pale dots.
    g.fillStyle = '#e8e8e8';
    for (const c of state.traffic) g.fillRect(px(c.x) - 1, pz(c.z) - 1, 2, 2);
    // Police flash blue/red.
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    g.fillStyle = flash ? '#3a86ff' : '#ff2a2a';
    for (const c of state.police) {
      g.beginPath(); g.arc(px(c.x), pz(c.z), 3, 0, Math.PI * 2); g.fill();
    }
    // Objective as a gold star.
    if (state.objectivePos) {
      const ox = px(state.objectivePos.x), oz = pz(state.objectivePos.z);
      g.fillStyle = '#ffd166';
      g.beginPath(); g.arc(ox, oz, 4.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff3d6'; g.stroke();
    }
    // Player arrow, rotated to heading.
    const x = px(state.x), y = pz(state.z);
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI - state.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
    g.restore();
  }
}
