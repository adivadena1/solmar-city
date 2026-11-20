// Solmar — the HUD and the menus. Everything the player reads lives in the
// DOM over the canvas: cash and health, the wanted stars, the speed, the
// mission objective, subtitles, the minimap (a live top-down canvas of the
// city), and the start, pause and busted screens.

import { CITY } from './config.js';

export class HUD {
  constructor() {
    this.moneyEl = document.getElementById('money');
    this.healthFill = document.getElementById('healthfill');
    this.starsEl = document.getElementById('stars');
    this.speedEl = document.getElementById('speed');
    this.objectiveEl = document.getElementById('objective');
    this.subtitleEl = document.getElementById('subtitle');
    this.messageEl = document.getElementById('message');
    this.promptEl = document.getElementById('prompt');
    this.crosshairEl = document.getElementById('crosshair');
    this.vignetteEl = document.getElementById('vignette');
    this.minimap = document.getElementById('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.menuEl = document.getElementById('menu');
    this.pauseEl = document.getElementById('pause');
    this.endEl = document.getElementById('endcard');
    this._messageTimer = 0;
    this._subtitleTimer = 0;
  }

  showMenu(saveData, onPlay, onContinue) {
    this.menuEl.style.display = 'flex';
    this.pauseEl.style.display = 'none';
    this.endEl.style.display = 'none';
    document.getElementById('menu-save').textContent = saveData
      ? `Continue — $${saveData.money}, ${saveData.missionsDone.length} of 4 jobs done`
      : 'No save yet — a new story in Solmar';
    document.getElementById('btn-play').onclick = () => onPlay(false);
    const cont = document.getElementById('btn-continue');
    cont.style.display = saveData ? 'inline-block' : 'none';
    cont.onclick = () => onPlay(true);
  }

  hideMenu() {
    this.menuEl.style.display = 'none';
  }

  showPause(onResume, onRestart, onQuit) {
    this.pauseEl.style.display = 'flex';
    document.getElementById('btn-resume').onclick = onResume;
    document.getElementById('btn-restart').onclick = onRestart;
    document.getElementById('btn-quit').onclick = onQuit;
  }

  hidePause() {
    this.pauseEl.style.display = 'none';
  }

  showEndCard(kind, money, onRespawn) {
    this.endEl.style.display = 'flex';
    document.getElementById('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    document.getElementById('end-text').textContent = kind === 'busted'
      ? `The Solmar police took $${money} and dropped you at the station. The city is still yours to take back.`
      : 'You went down in the streets of Solmar. The hospital patched you up — for a price.';
    document.getElementById('btn-respawn').onclick = onRespawn;
  }

  hideEndCard() {
    this.endEl.style.display = 'none';
  }

  showMessage(text) {
    this.messageEl.textContent = text;
    this.messageEl.style.opacity = '1';
    this._messageTimer = 2.8;
  }

  showSubtitle(text, seconds = 3.5) {
    this.subtitleEl.textContent = text;
    this.subtitleEl.style.opacity = '1';
    this._subtitleTimer = seconds;
  }

  /** Every frame: cash, health, stars, speed, objective, minimap. */
  update(game, dt) {
    if (this._messageTimer > 0) {
      this._messageTimer -= dt;
      if (this._messageTimer <= 0) this.messageEl.style.opacity = '0';
    }
    if (this._subtitleTimer > 0) {
      this._subtitleTimer -= dt;
      if (this._subtitleTimer <= 0) this.subtitleEl.style.opacity = '0';
    }
    this.moneyEl.textContent = `$${Math.floor(game.money)}`;
    this.healthFill.style.width = `${Math.max(0, game.player.health)}%`;
    this.healthFill.style.background = game.player.health > 50 ? '#58d858' : game.player.health > 25 ? '#e8a83a' : '#e83a3a';
    const stars = game.police.stars;
    let starText = '';
    for (let i = 0; i < 5; i += 1) starText += i < stars ? '★' : '☆';
    this.starsEl.textContent = starText;
    this.starsEl.style.color = stars > 0 ? '#ffd76a' : 'rgba(255,255,255,0.35)';
    const car = game.player.inCar;
    this.speedEl.textContent = car ? `${Math.round(Math.abs(car.speed) * 3.6)} km/h` : '';
    this.objectiveEl.textContent = game.missions.currentObjective();
    this.promptEl.textContent = game.prompt || '';
    this.crosshairEl.style.display = game.player.armed && !car ? 'block' : 'none';
    this.vignetteEl.style.opacity = String(game.player.hurtFlash * 0.55);
    this._drawMinimap(game);
  }

  _drawMinimap(game) {
    const ctx = this.mapCtx;
    const W = 200;
    const H = 200;
    const x0 = -CITY.half;
    const x1 = CITY.half;
    const z0 = -CITY.half;
    const z1 = CITY.oceanEnd;
    const sx = (x) => ((x - x0) / (x1 - x0)) * W;
    const sy = (z) => ((z - z0) / (z1 - z0)) * H;
    ctx.clearRect(0, 0, W, H);
    // Land: city grey, sand, ocean.
    ctx.fillStyle = '#7a8288';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, sy(CITY.beachStart), W, sy(CITY.sandEnd) - sy(CITY.beachStart));
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, sy(CITY.sandEnd), W, H - sy(CITY.sandEnd));
    // Roads.
    ctx.strokeStyle = '#3a3f45';
    ctx.lineWidth = 4;
    for (const c of CITY.roads) {
      ctx.beginPath();
      ctx.moveTo(sx(c), 0);
      ctx.lineTo(sx(c), H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, sy(c));
      ctx.lineTo(W, sy(c));
      ctx.stroke();
    }
    // Mission target: a pulsing gold ring.
    const target = game.missions.currentTarget();
    if (target) {
      const pulse = 5 + Math.sin(performance.now() / 250) * 2;
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(target.x), sy(target.z), pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(sx(target.x), sy(target.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic (amber), police (flashing blue/red), guards (red).
    ctx.fillStyle = '#ffcf3a';
    for (const car of game.traffic.cars) {
      ctx.fillRect(sx(car.pos.x) - 1.5, sy(car.pos.z) - 1.5, 3, 3);
    }
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#2266ff' : '#ff2222';
    for (const car of game.police.cars) {
      ctx.beginPath();
      ctx.arc(sx(car.pos.x), sy(car.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff4444';
    for (const g of game.missions.guards) {
      if (g.down > 0) continue;
      ctx.beginPath();
      ctx.arc(sx(g.pos.x), sy(g.pos.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow pointing where they face.
    const p = game.player;
    const px = sx(p.pos.x);
    const pz = sy(p.pos.z);
    const heading = p.inCar ? p.inCar.heading : p.heading;
    ctx.save();
    ctx.translate(px, pz);
    // The arrow is drawn pointing up; rotating by (PI - heading) aims it
    // along the player's forward vector, since the map's z grows downward
    // on the canvas while the world heading is measured from +z.
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North.
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillText('N', 4, 12);
  }
}
