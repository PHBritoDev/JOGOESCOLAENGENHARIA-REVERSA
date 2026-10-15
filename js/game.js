(() => {
  "use strict";

  const { ArenaGame, HEROES, MAP, clamp } = window.ArenaEngine;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const canvas = $("#game-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const spriteSheet = new Image();
  spriteSheet.src = "assets/characters.svg";

  const view = {
    menu: $("#menu-screen"),
    arena: $("#arena-screen"),
    pause: $("#pause-overlay"),
    result: $("#result-overlay"),
    canvas,
  };
  const buttons = {
    start: $("#start-button"),
    leave: $("#leave-button"),
    pause: $("#pause-button"),
    resume: $("#resume-button"),
    restart: $("#pause-restart"),
    again: $("#again-button"),
    menu: $("#menu-button"),
    special: $("#special-button"),
  };
  const status = {
    health: $("#health-fill"),
    healthValue: $("#health-value"),
    playerName: $("#player-name"),
    cubes: $("#cube-count"),
    kills: $("#kill-count"),
    bots: $("#remaining-count"),
    timer: $("#match-timer"),
    charge: $("#special-charge"),
    cooldown: $("#cooldown-fill"),
    toast: $("#toast-message"),
    storm: $("#storm-warning"),
  };
  const heroDetails = {
    mira: { style: "Rajada precisa", special: "Arrancada" },
    brasa: { style: "Leque de curta distância", special: "Pulso de impacto" },
    volta: { style: "Orbes que atravessam rivais", special: "Arco elétrico" },
  };
  const keys = new Set();
  const input = { moveX: 0, moveY: 0, aim: -Math.PI / 2, fireHeld: false, aimPointer: false };
  let game = null;
  let frameId = 0;
  let previousTime = 0;
  let lastHudUpdate = 0;
  let toastTimeout = 0;
  let camera = { x: 0, y: 0, width: 0, height: 0 };
  let dpr = 1;
  let movePointer = null;
  let aimPointer = null;
  let selectedHero = "mira";
  let selectedDifficulty = "normal";
  let selectedMode = "showdown";

  function setScreen(name) {
    view.menu.classList.toggle("is-hidden", name !== "menu");
    view.arena.classList.toggle("is-hidden", name !== "arena");
  }

  function formatTime(seconds) {
    const whole = Math.floor(seconds);
    return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
  }

  function showToast(message, duration = 1700) {
    status.toast.textContent = message;
    status.toast.classList.add("visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => status.toast.classList.remove("visible"), duration);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera.width = rect.width;
    camera.height = rect.height;
  }

  function beginMatch() {
    window.cancelAnimationFrame(frameId);
    game = new ArenaGame({
      hero: selectedHero,
      difficulty: selectedDifficulty,
      mode: selectedMode,
    }).start();
    input.moveX = 0;
    input.moveY = 0;
    input.fireHeld = false;
    input.aimPointer = false;
    input.aim = -Math.PI / 2;
    $("#move-knob").style.transform = "translate(0, 0)";
    $("#aim-knob").style.transform = "translate(0, 0)";
    status.playerName.textContent = HEROES[selectedHero].name.toUpperCase();
    $("#mode-label").textContent = selectedMode === "showdown" ? "SHOWDOWN SOLO" : "TREINO";
    status.storm.classList.add("is-hidden");
    view.pause.classList.add("is-hidden");
    view.result.classList.add("is-hidden");
    setScreen("arena");
    resizeCanvas();
    updateHud(true);
    previousTime = performance.now();
    frameId = window.requestAnimationFrame(loop);
    if (selectedMode === "showdown") showToast("Abra uma caixa para ganhar cubos. Fique de olho na zona segura.");
    else showToast("Treino iniciado. Os rivais também vão disputar cubos entre si.");
  }

  function goToMenu() {
    window.cancelAnimationFrame(frameId);
    keys.clear();
    input.moveX = 0;
    input.moveY = 0;
    input.fireHeld = false;
    movePointer = null;
    aimPointer = null;
    view.pause.classList.add("is-hidden");
    view.result.classList.add("is-hidden");
    setScreen("menu");
  }

  function pauseMatch() {
    if (!game || game.state !== "playing") return;
    game.state = "paused";
    view.pause.classList.remove("is-hidden");
  }

  function resumeMatch() {
    if (!game || game.state !== "paused") return;
    game.state = "playing";
    view.pause.classList.add("is-hidden");
    previousTime = performance.now();
    frameId = window.requestAnimationFrame(loop);
  }

  function endMatch(result) {
    if (!game || (game.state !== "won" && game.state !== "lost")) return;
    const won = result === "won";
    $("#result-title").textContent = won ? "VOCÊ SOBREVIVEU" : "FIM DE JOGO";
    $("#result-kicker").textContent = won ? "O VALE TEM UM VENCEDOR" : "A ARENA FICOU MAIS FORTE";
    $("#result-copy").textContent = won
      ? "Último lutador de pé. O vale é seu."
      : "Você caiu nesta rodada, mas ainda pode tentar de novo.";
    $("#result-orbit").classList.toggle("defeat", !won);
    $("#result-kills").textContent = String(game.kills);
    $("#result-time").textContent = formatTime(game.elapsed);
    $("#result-cubes").textContent = String(game.player ? game.player.powerCubes : 0);
    view.pause.classList.add("is-hidden");
    view.result.classList.remove("is-hidden");
    saveResult(won);
    window.cancelAnimationFrame(frameId);
  }

  function saveResult(won) {
    try {
      const key = "arena-reversa-stats-v1";
      const current = JSON.parse(localStorage.getItem(key) || '{"wins":0,"losses":0,"matches":0}');
      if (won) current.wins += 1;
      else current.losses += 1;
      current.matches += 1;
      localStorage.setItem(key, JSON.stringify(current));
    } catch (_error) {
      // A partida continua jogável quando o navegador bloqueia armazenamento local.
    }
  }

  function updateHud(force = false) {
    if (!game || !game.player) return;
    const now = performance.now();
    if (!force && now - lastHudUpdate < 65) return;
    lastHudUpdate = now;
    const player = game.player;
    const hp = clamp(player.hp / player.maxHp, 0, 1);
    status.health.style.width = `${hp * 100}%`;
    status.healthValue.textContent = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`;
    status.cubes.textContent = String(player.powerCubes);
    status.kills.textContent = String(game.kills).padStart(2, "0");
    status.bots.textContent = String(game.remainingBots).padStart(2, "0");
    status.timer.textContent = formatTime(game.elapsed);
    status.charge.style.height = `${clamp(player.special, 0, 100)}%`;
    buttons.special.disabled = player.special < 100;
    const hero = HEROES[player.heroId];
    const reload = hero.reload;
    const progress = player.cooldown <= 0 ? 100 : clamp((1 - player.cooldown / reload) * 100, 0, 100);
    status.cooldown.style.width = `${progress}%`;
    status.storm.classList.toggle("is-hidden",
      game.mode === "training" || (game.elapsed < game.storm.startsAt - 10) || game.state !== "playing");
  }

  function getCamera() {
    if (!game || !game.player) return;
    const w = camera.width;
    const h = camera.height;
    camera.x = clamp(game.player.x - w / 2, 0, Math.max(0, MAP.width - w));
    camera.y = clamp(game.player.y - h / 2, 0, Math.max(0, MAP.height - h));
  }

  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    getCamera();
    return {
      x: camera.x + (clientX - rect.left) * (camera.width / rect.width),
      y: camera.y + (clientY - rect.top) * (camera.height / rect.height),
    };
  }

  function updatePlayer(dt) {
    if (!game || !game.player || !game.player.alive) return;
    const player = game.player;
    const moving = Math.hypot(input.moveX, input.moveY) > 0.04;
    if (moving) {
      player.angle = Math.atan2(input.moveY, input.moveX);
      game.move(player, input.moveX * player.speed * dt, input.moveY * player.speed * dt);
    }
    if (input.aimPointer) player.angle = input.aim;
    else if (input.fireHeld) player.angle = input.aim;
    if (input.fireHeld && player.cooldown <= 0) game.fire(player, player.angle);
  }

  function loop(now) {
    if (!game || game.state !== "playing") return;
    const dt = Math.min(0.055, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    updatePlayer(dt);
    game.update(dt);
    getCamera();
    drawArena();
    updateHud();
    if (game.state === "won" || game.state === "lost") {
      endMatch(game.state);
      return;
    }
    frameId = window.requestAnimationFrame(loop);
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
  }

  function drawGround() {
    const w = camera.width, h = camera.height;
    ctx.fillStyle = "#719451";
    ctx.fillRect(0, 0, w, h);
    const tile = 74;
    const startX = -camera.x % tile;
    const startY = -camera.y % tile;
    for (let y = startY - tile; y < h + tile; y += tile) {
      for (let x = startX - tile; x < w + tile; x += tile) {
        const wx = Math.floor((camera.x + x) / tile);
        const wy = Math.floor((camera.y + y) / tile);
        const variation = ((wx * 13 + wy * 19) % 7 + 7) % 7;
        ctx.fillStyle = variation === 0 ? "#95ad63" : variation < 3 ? "#7b9b52" : "#718f4e";
        ctx.globalAlpha = variation === 0 ? 0.22 : 0.12;
        roundRect(x, y, tile - 2, tile - 2, 12);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#e6d39b40";
    ctx.lineWidth = 31;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-camera.x - 80, MAP.height * 0.52 - camera.y);
    ctx.bezierCurveTo(MAP.width * .33 - camera.x, MAP.height * .45 - camera.y,
      MAP.width * .63 - camera.x, MAP.height * .58 - camera.y, MAP.width + 80 - camera.x, MAP.height * .47 - camera.y);
    ctx.stroke();
    ctx.strokeStyle = "#385b4140";
    ctx.lineWidth = 3;
    for (let i = 0; i < 30; i += 1) {
      const x = ((i * 131 + 41) % MAP.width) - camera.x;
      const y = ((i * 197 + 23) % MAP.height) - camera.y;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8 + (i % 8), y + 4 + (i % 5));
      ctx.stroke();
    }
  }

  function drawBush(obstacle) {
    const x = obstacle.x - camera.x, y = obstacle.y - camera.y;
    if (x + obstacle.w < -80 || x > camera.width + 80 || y + obstacle.h < -80 || y > camera.height + 80) return;
    const sway = Math.sin(game.elapsed * 1.4 + obstacle.sway) * 2;
    ctx.save();
    ctx.translate(x, y + sway);
    ctx.fillStyle = "#244c3c";
    ctx.beginPath();
    ctx.ellipse(obstacle.w / 2, obstacle.h * .72, obstacle.w * .48, obstacle.h * .31, 0, 0, Math.PI * 2);
    ctx.fill();
    const leaves = 11;
    for (let i = 0; i < leaves; i += 1) {
      const angle = (Math.PI * 2 * i) / leaves;
      const px = obstacle.w / 2 + Math.cos(angle) * obstacle.w * .31;
      const py = obstacle.h / 2 + Math.sin(angle) * obstacle.h * .29;
      const radius = 19 + (i % 3) * 3;
      const gradient = ctx.createRadialGradient(px - 6, py - 8, 2, px, py, radius);
      gradient.addColorStop(0, i % 3 === 0 ? "#9bc96a" : "#80b55f");
      gradient.addColorStop(.7, i % 2 ? "#51884f" : "#528c53");
      gradient.addColorStop(1, "#326747");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(px, py, radius * 1.13, radius * .83, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#b7d7778c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(obstacle.w * .26, obstacle.h * .52);
    ctx.quadraticCurveTo(obstacle.w * .52, obstacle.h * .15, obstacle.w * .77, obstacle.h * .51);
    ctx.stroke();
    ctx.restore();
  }

  function drawRock(obstacle) {
    const x = obstacle.x - camera.x, y = obstacle.y - camera.y;
    if (x + obstacle.w < -50 || x > camera.width + 50 || y + obstacle.h < -50 || y > camera.height + 50) return;
    const w = obstacle.w, h = obstacle.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#2d4035a8";
    ctx.beginPath();
    ctx.ellipse(w * .52, h * .81, w * .52, h * .21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * .04, h * .63); ctx.lineTo(w * .16, h * .28);
    ctx.lineTo(w * .41, h * .07); ctx.lineTo(w * .74, h * .11);
    ctx.lineTo(w * .96, h * .39); ctx.lineTo(w * .88, h * .79);
    ctx.lineTo(w * .55, h * .93); ctx.lineTo(w * .16, h * .84); ctx.closePath();
    const stone = ctx.createLinearGradient(0, 0, w, h);
    stone.addColorStop(0, "#d2c69c"); stone.addColorStop(.5, "#a49a79"); stone.addColorStop(1, "#68664f");
    ctx.fillStyle = stone;
    ctx.fill();
    ctx.strokeStyle = "#e4d8ac";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#e5d9b17a";
    ctx.beginPath(); ctx.moveTo(w * .16, h * .28); ctx.lineTo(w * .41, h * .07); ctx.lineTo(w * .74, h * .11); ctx.lineTo(w * .48, h * .32); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#625f4b75";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * .5, h * .34); ctx.lineTo(w * .43, h * .58); ctx.lineTo(w * .59, h * .7); ctx.stroke();
    ctx.restore();
  }

  function drawCrate(obstacle) {
    if (obstacle.destroyed) return;
    const x = obstacle.x - camera.x, y = obstacle.y - camera.y;
    if (x + obstacle.w < -60 || x > camera.width + 60 || y + obstacle.h < -60 || y > camera.height + 60) return;
    const w = obstacle.w, h = obstacle.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#2d352a88";
    ctx.beginPath(); ctx.ellipse(w / 2, h + 8, w * .53, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = obstacle.flash > 0 ? "#ffe0a1" : "#8e542f";
    roundRect(3, 9, w - 6, h - 12, 9); ctx.fill();
    ctx.fillStyle = obstacle.flash > 0 ? "#ffe0a1" : "#c18045";
    roundRect(0, 0, w - 4, h - 12, 8); ctx.fill();
    ctx.strokeStyle = "#e2b774";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "#8f542f";
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(9, 8); ctx.lineTo(w - 15, h - 22); ctx.moveTo(w - 15, 8); ctx.lineTo(9, h - 22); ctx.stroke();
    ctx.strokeStyle = "#e6bd7b";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(10, 8); ctx.lineTo(w - 14, h - 22); ctx.moveTo(w - 14, 8); ctx.lineTo(10, h - 22); ctx.stroke();
    ctx.fillStyle = "#f2d59a";
    for (const [nx, ny] of [[9, 8], [w - 14, 8], [9, h - 22], [w - 14, h - 22]]) {
      ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#ffe6a8";
    ctx.beginPath(); ctx.moveTo(w / 2 - 7, h / 2 - 12); ctx.lineTo(w / 2, h / 2 - 18); ctx.lineTo(w / 2 + 7, h / 2 - 12); ctx.lineTo(w / 2, h / 2 - 6); ctx.closePath(); ctx.fill();
    if (obstacle.hp < obstacle.maxHp) {
      ctx.fillStyle = "#27372e";
      roundRect(7, -8, w - 18, 5, 3); ctx.fill();
      ctx.fillStyle = "#f1d36f";
      roundRect(7, -8, (w - 18) * Math.max(0, obstacle.hp / obstacle.maxHp), 5, 3); ctx.fill();
    }
    ctx.restore();
  }

  function drawObstacles() {
    for (const obstacle of game.obstacles) if (obstacle.kind === "rock") drawRock(obstacle);
    for (const obstacle of game.obstacles) if (obstacle.kind === "crate") drawCrate(obstacle);
    for (const obstacle of game.obstacles) if (obstacle.kind === "bush") drawBush(obstacle);
  }

  function drawCube(pickup) {
    const x = pickup.x - camera.x;
    const y = pickup.y - camera.y + Math.sin(pickup.bob || 0) * 4;
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 30);
    glow.addColorStop(0, "#e8ff9b99"); glow.addColorStop(1, "#b8f46100");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#596a35"; roundRect(-10, -10, 22, 22, 4); ctx.fill();
    const cube = ctx.createLinearGradient(-9, -9, 10, 11);
    cube.addColorStop(0, "#f3ffab"); cube.addColorStop(.45, "#c5f36c"); cube.addColorStop(1, "#7dbc47");
    ctx.fillStyle = cube; roundRect(-11, -12, 21, 21, 4); ctx.fill();
    ctx.strokeStyle = "#f6ffca"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#efffa5"; ctx.fillRect(-2, -8, 4, 13);
    ctx.restore();
  }

  function drawProjectiles() {
    for (const shot of game.projectiles) {
      const x = shot.x - camera.x, y = shot.y - camera.y;
      ctx.strokeStyle = `${shot.color}69`;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - shot.vx * .035, y - shot.vy * .035);
      ctx.lineTo(x, y);
      ctx.stroke();
      const glow = ctx.createRadialGradient(x, y, 1, x, y, 14);
      glow.addColorStop(0, "#fffde0"); glow.addColorStop(.24, shot.color); glow.addColorStop(1, `${shot.color}00`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffdf";
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawFighter(fighter) {
    if (!fighter.alive) return;
    const x = fighter.x - camera.x, y = fighter.y - camera.y;
    if (x < -90 || x > camera.width + 90 || y < -90 || y > camera.height + 90) return;
    const scale = fighter.kind === "player" ? 1 : .91;
    ctx.save();
    ctx.translate(x, y);
    const bob = Math.sin(fighter.bob) * 1.3;
    ctx.fillStyle = "#1e3b2d69";
    ctx.beginPath(); ctx.ellipse(3, 19, 24 * scale, 11 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = fighter.kind === "player" ? "#e9ff9c" : `${fighter.accent}b8`;
    ctx.lineWidth = fighter.kind === "player" ? 3 : 2;
    ctx.beginPath(); ctx.ellipse(0, 12, 22 * scale, 10 * scale, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.rotate(fighter.angle + Math.PI / 2);
    ctx.translate(0, bob);
    if (spriteSheet.complete && spriteSheet.naturalWidth >= 900) {
      ctx.drawImage(spriteSheet, fighter.sprite * 300, 0, 300, 300, -38 * scale, -42 * scale, 76 * scale, 84 * scale);
    } else {
      ctx.fillStyle = fighter.accent;
      ctx.beginPath(); ctx.ellipse(0, 0, 18 * scale, 22 * scale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#332e34"; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = "#f6d3a1";
      ctx.beginPath(); ctx.arc(-6, -6, 3, 0, Math.PI * 2); ctx.arc(6, -6, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (fighter.kind === "bot" && camera.width > 500) {
      ctx.font = "900 9px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#18251dd9";
      ctx.strokeText(fighter.name.toUpperCase(), x, y - 37);
      ctx.fillStyle = "#fff4d7";
      ctx.fillText(fighter.name.toUpperCase(), x, y - 37);
      ctx.textAlign = "start";
    }
    const barW = fighter.kind === "player" ? 45 : 33;
    const barY = y - (fighter.kind === "player" ? 33 : 28);
    ctx.fillStyle = "#16211dbd";
    roundRect(x - barW / 2 - 1, barY - 1, barW + 2, 5, 3); ctx.fill();
    ctx.fillStyle = fighter.kind === "player" ? "#bcf36b" : "#ff9677";
    roundRect(x - barW / 2, barY, barW * clamp(fighter.hp / fighter.maxHp, 0, 1), 3, 2); ctx.fill();
    if (fighter.invulnerable > 0) {
      ctx.strokeStyle = "#e7ffe4";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(x, y, 31, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (fighter.stunned > 0) {
      ctx.fillStyle = "#e1d2ff";
      for (let i = 0; i < 3; i += 1) {
        const angle = game.elapsed * 5 + i * (Math.PI * 2 / 3);
        ctx.beginPath(); ctx.arc(x + Math.cos(angle) * 22, y - 34 + Math.sin(angle) * 5, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawParticles() {
    for (const particle of game.particles) {
      const t = clamp(particle.life / particle.maxLife, 0, 1);
      const x = particle.x !== undefined ? particle.x - camera.x : 0;
      const y = particle.y !== undefined ? particle.y - camera.y : 0;
      ctx.globalAlpha = t;
      if (particle.type === "lightning") {
        ctx.strokeStyle = particle.color; ctx.lineWidth = 5 * t + 1; ctx.lineCap = "round";
        ctx.shadowBlur = 16; ctx.shadowColor = particle.color;
        ctx.beginPath(); ctx.moveTo(x, y);
        const x2 = particle.x2 - camera.x, y2 = particle.y2 - camera.y;
        const steps = 7;
        for (let i = 1; i < steps; i += 1) {
          const progress = i / steps;
          ctx.lineTo(x + (x2 - x) * progress + Math.sin(i * 9 + game.elapsed * 50) * 9,
            y + (y2 - y) * progress + Math.cos(i * 7 + game.elapsed * 40) * 8);
        }
        ctx.lineTo(x2, y2); ctx.stroke(); ctx.shadowBlur = 0;
      } else if (particle.type === "blast" || particle.type === "elimination") {
        const progress = 1 - t;
        const radius = (particle.radius || 40) * progress;
        ctx.strokeStyle = particle.color; ctx.lineWidth = 7 * t + 1; ctx.shadowBlur = 19; ctx.shadowColor = particle.color;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        if (particle.type === "blast") {
          ctx.fillStyle = `${particle.color}20`;
          ctx.beginPath(); ctx.arc(x, y, radius * .7, 0, Math.PI * 2); ctx.fill();
        }
      } else if (particle.type === "dash") {
        ctx.fillStyle = particle.color;
        ctx.beginPath(); ctx.ellipse(x, y, 10 * t + 2, 6 * t + 1, game.player.angle, 0, Math.PI * 2); ctx.fill();
      } else {
        const radius = particle.type === "wood" ? 3 + (1 - t) * 5 : 2 + (1 - t) * 4;
        ctx.fillStyle = particle.color || "#f4e6bd";
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawStorm() {
    if (!game.storm.active) return;
    const sx = game.storm.x - camera.x;
    const sy = game.storm.y - camera.y;
    ctx.save();
    ctx.fillStyle = "#b63e4b4f";
    ctx.beginPath();
    ctx.rect(0, 0, camera.width, camera.height);
    ctx.arc(sx, sy, game.storm.radius, 0, Math.PI * 2, true);
    try { ctx.fill("evenodd"); } catch (_error) { ctx.fill(); }
    ctx.strokeStyle = "#ff93838c";
    ctx.lineWidth = 8;
    ctx.setLineDash([14, 13]);
    ctx.beginPath(); ctx.arc(sx, sy, game.storm.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#ffbaa15c";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, game.storm.radius - 7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawArena() {
    const w = camera.width, h = camera.height;
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawGround();
    drawObstacles();
    for (const pickup of game.pickups) drawCube(pickup);
    drawProjectiles();
    for (const fighter of game.fighters) drawFighter(fighter);
    drawParticles();
    drawStorm();
    const compassX = w - 29, compassY = 80;
    ctx.fillStyle = "#14241ec9";
    ctx.beginPath(); ctx.arc(compassX, compassY, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#eff7dc85"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(compassX, compassY - 8); ctx.lineTo(compassX, compassY + 7); ctx.stroke();
    ctx.fillStyle = "#d9f27a";
    ctx.beginPath(); ctx.moveTo(compassX, compassY - 11); ctx.lineTo(compassX - 4, compassY - 3); ctx.lineTo(compassX + 4, compassY - 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f3f4df";
    ctx.font = "900 7px Trebuchet MS, sans-serif";
    ctx.textAlign = "center"; ctx.fillText("N", compassX, compassY - 19); ctx.textAlign = "start";
  }

  function chooseHero(heroId) {
    if (!HEROES[heroId]) return;
    selectedHero = heroId;
    $$(".fighter-card").forEach((card) => {
      const selected = card.dataset.hero === heroId;
      card.classList.toggle("selected", selected);
      card.setAttribute("aria-pressed", String(selected));
    });
    $("#fighter-style").textContent = heroDetails[heroId].style;
    $("#special-name").textContent = heroDetails[heroId].special;
  }

  $$(".fighter-card").forEach((card) => card.addEventListener("click", () => chooseHero(card.dataset.hero)));
  $$(".mode-card").forEach((card) => card.addEventListener("click", () => {
    selectedMode = card.dataset.mode === "training" ? "training" : "showdown";
    $$(".mode-card").forEach((other) => other.classList.toggle("selected", other === card));
  }));
  $$(".difficulty-options button").forEach((button) => button.addEventListener("click", () => {
    selectedDifficulty = button.dataset.difficulty;
    $$(".difficulty-options button").forEach((other) => other.classList.toggle("selected", other === button));
  }));
  buttons.start.addEventListener("click", beginMatch);
  buttons.pause.addEventListener("click", pauseMatch);
  buttons.resume.addEventListener("click", resumeMatch);
  buttons.restart.addEventListener("click", beginMatch);
  buttons.again.addEventListener("click", beginMatch);
  buttons.menu.addEventListener("click", goToMenu);
  buttons.leave.addEventListener("click", goToMenu);
  function useSpecial(event) {
    if (event) event.preventDefault();
    if (game && game.player) {
      const fired = game.activateSpecial(game.player, input.aim);
      if (fired) showToast(HEROES[game.player.heroId].specialName.toUpperCase() + "!");
      updateHud(true);
    }
  }
  buttons.special.addEventListener("pointerdown", useSpecial);

  function updatePad(event, pad, knob, type) {
    const rect = pad.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const max = rect.width * .34;
    const magnitude = Math.hypot(dx, dy) || 1;
    const strength = Math.min(1, magnitude / max);
    const vx = (dx / magnitude) * strength;
    const vy = (dy / magnitude) * strength;
    knob.style.transform = `translate(${vx * max}px, ${vy * max}px)`;
    if (type === "move") {
      input.moveX = vx;
      input.moveY = vy;
    } else if (strength > .12) {
      input.aim = Math.atan2(vy, vx);
      input.aimPointer = true;
    }
  }

  function bindPad(id, knobId, type) {
    const pad = document.getElementById(id);
    const knob = document.getElementById(knobId);
    const pointerRef = type === "move" ? () => movePointer : () => aimPointer;
    pad.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      pad.setPointerCapture(event.pointerId);
      if (type === "move") movePointer = event.pointerId;
      else {
        aimPointer = event.pointerId;
        input.fireHeld = true;
      }
      updatePad(event, pad, knob, type);
    });
    pad.addEventListener("pointermove", (event) => {
      if (event.pointerId === pointerRef()) updatePad(event, pad, knob, type);
    });
    const release = (event) => {
      if (event.pointerId !== pointerRef()) return;
      if (type === "move") {
        movePointer = null;
        input.moveX = 0; input.moveY = 0;
      } else {
        aimPointer = null;
        input.fireHeld = false;
        input.aimPointer = false;
      }
      knob.style.transform = "translate(0, 0)";
    };
    pad.addEventListener("pointerup", release);
    pad.addEventListener("pointercancel", release);
  }
  bindPad("move-pad", "move-knob", "move");
  bindPad("aim-pad", "aim-knob", "aim");

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || !game || game.state !== "playing") return;
    const point = toWorld(event.clientX, event.clientY);
    input.aim = Math.atan2(point.y - game.player.y, point.x - game.player.x);
    input.aimPointer = true;
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || !game || game.state !== "playing") return;
    const point = toWorld(event.clientX, event.clientY);
    input.aim = Math.atan2(point.y - game.player.y, point.x - game.player.x);
    input.aimPointer = true;
    input.fireHeld = true;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse") input.fireHeld = false;
  });
  canvas.addEventListener("pointercancel", () => { input.fireHeld = false; });
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "escape") {
      event.preventDefault();
      if (game && game.state === "playing") pauseMatch();
      else if (game && game.state === "paused") resumeMatch();
      return;
    }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    keys.add(key);
    if (!game || game.state !== "playing") return;
    input.moveX = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    input.moveY = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
    if (key === " " && !event.repeat) useSpecial(event);
  });
  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
    input.moveX = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    input.moveY = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  });
  window.addEventListener("blur", () => {
    keys.clear();
    input.moveX = 0; input.moveY = 0; input.fireHeld = false;
    movePointer = null; aimPointer = null;
  });
  window.addEventListener("resize", resizeCanvas);
  if ("ResizeObserver" in window) new ResizeObserver(resizeCanvas).observe(view.arena);

  // Small, stable hooks let the smoke tests exercise the same engine used by the UI.
  window.ArenaReversa = {
    start: beginMatch,
    getGame: () => game,
    getInput: () => ({ ...input }),
    pause: pauseMatch,
    resume: resumeMatch,
  };
  resizeCanvas();
})();
