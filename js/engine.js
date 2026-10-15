/* Arena Reversa — standalone, deterministic-friendly browser game engine. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ArenaEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAP = Object.freeze({ width: 1840, height: 1260 });
  const HEROES = Object.freeze({
    mira: {
      name: "Mira",
      title: "Batedora do Farol",
      sprite: 0,
      hp: 112,
      speed: 238,
      range: 510,
      reload: 0.34,
      damage: 17,
      pattern: "triple",
      specialName: "Arrancada",
      accent: "#36dfd0",
    },
    brasa: {
      name: "Brasa",
      title: "Guardião das Dunas",
      sprite: 1,
      hp: 158,
      speed: 177,
      range: 350,
      reload: 0.72,
      damage: 23,
      pattern: "fan",
      specialName: "Pulso de impacto",
      accent: "#ff9858",
    },
    volta: {
      name: "Volta",
      title: "Inventora do Vale",
      sprite: 2,
      hp: 128,
      speed: 207,
      range: 455,
      reload: 0.5,
      damage: 21,
      pattern: "pierce",
      specialName: "Arco elétrico",
      accent: "#b292ff",
    },
  });
  const DIFFICULTIES = Object.freeze({
    easy: { bots: 5, hp: 86, speed: 112, reload: 1.12, accuracy: 0.2, cubeDrop: 2 },
    normal: { bots: 8, hp: 104, speed: 132, reload: 0.86, accuracy: 0.12, cubeDrop: 3 },
    hard: { bots: 10, hp: 124, speed: 151, reload: 0.66, accuracy: 0.07, cubeDrop: 4 },
  });

  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  class ArenaGame {
    constructor(options = {}) {
      this.options = options;
      this.rng = options.rng || Math.random;
      this.heroId = HEROES[options.hero] ? options.hero : "mira";
      this.difficultyId = DIFFICULTIES[options.difficulty] ? options.difficulty : "normal";
      this.mode = options.mode === "training" ? "training" : "showdown";
      this.reset();
    }

    random(min, max) {
      return min + this.rng() * (max - min);
    }

    reset() {
      this.elapsed = 0;
      this.state = "menu";
      this.kills = 0;
      this.projectiles = [];
      this.particles = [];
      this.pickups = [];
      this.obstacles = this.makeObstacles();
      this.player = null;
      this.bots = [];
      this.storm = {
        active: false,
        x: MAP.width / 2,
        y: MAP.height / 2,
        startRadius: 990,
        radius: 990,
        endRadius: 92,
        startsAt: this.mode === "training" ? Infinity : 42,
        duration: 128,
        damagePerSecond: 12,
      };
      this.events = [];
    }

    makeObstacles() {
      const specs = [
        [245, 230, 190, 116, "rock"], [730, 190, 180, 118, "bush"],
        [1228, 225, 205, 125, "rock"], [1520, 472, 165, 130, "bush"],
        [295, 570, 170, 128, "bush"], [820, 500, 205, 116, "rock"],
        [1130, 682, 185, 130, "bush"], [420, 890, 210, 122, "rock"],
        [1430, 930, 230, 125, "rock"], [880, 1010, 160, 122, "bush"],
        [545, 380, 66, 62, "crate"], [1090, 410, 66, 62, "crate"],
        [1390, 665, 66, 62, "crate"], [640, 760, 66, 62, "crate"],
        [1130, 980, 66, 62, "crate"], [250, 1010, 66, 62, "crate"],
        [1530, 250, 66, 62, "crate"], [895, 285, 66, 62, "crate"],
      ];
      return specs.map(([x, y, w, h, kind], index) => ({
        id: `obstacle-${index}`,
        x, y, w, h, kind,
        hp: kind === "crate" ? 72 : Infinity,
        maxHp: kind === "crate" ? 72 : Infinity,
        destroyed: false,
        sway: this.random(0, Math.PI * 2),
      }));
    }

    makeFighter({ id, x, y, kind, heroId, name }) {
      const hero = HEROES[heroId] || HEROES.mira;
      const difficulty = DIFFICULTIES[this.difficultyId];
      const isPlayer = kind === "player";
      const hp = isPlayer ? hero.hp : difficulty.hp;
      return {
        id, x, y, kind, name: name || hero.name, heroId,
        sprite: hero.sprite, accent: hero.accent,
        radius: isPlayer ? 23 : 21,
        hp, maxHp: hp, speed: isPlayer ? hero.speed : difficulty.speed,
        damage: isPlayer ? hero.damage : 14,
        reload: isPlayer ? hero.reload : difficulty.reload,
        range: isPlayer ? hero.range : 430,
        cooldown: 0, special: 0, powerCubes: 0,
        angle: -Math.PI / 2, alive: true, stunned: 0, invulnerable: 0,
        stormClock: 0, brainClock: this.random(0, 0.5),
        strafe: this.rng() < 0.5 ? -1 : 1,
        wander: this.random(0, Math.PI * 2),
        flash: 0, bob: this.random(0, Math.PI * 2),
        lastHitBy: null, kills: 0,
      };
    }

    start() {
      this.reset();
      const hero = HEROES[this.heroId];
      const center = { x: MAP.width / 2, y: MAP.height / 2 };
      this.player = this.makeFighter({
        id: "player", kind: "player", heroId: this.heroId,
        name: hero.name, x: center.x, y: center.y + 92,
      });
      const count = this.mode === "training" ? 4 : DIFFICULTIES[this.difficultyId].bots;
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + this.random(-0.15, 0.15);
        const radius = this.random(500, 760);
        const botHero = ["mira", "brasa", "volta"][i % 3];
        const bot = this.makeFighter({
          id: `bot-${i + 1}`, kind: "bot", heroId: botHero,
          name: ["Lume", "Teca", "Neco", "Jade", "Caju", "Fagulha", "Nuvem", "Zico", "Lótus", "Pingo"][i],
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        });
        let tries = 0;
        while (this.collidesWithSolid(bot.x, bot.y, bot.radius) && tries < 24) {
          const offset = angle + (tries + 1) * Math.PI / 6;
          const distanceFromCenter = Math.min(820, radius + Math.floor(tries / 6) * 52);
          bot.x = center.x + Math.cos(offset) * distanceFromCenter;
          bot.y = center.y + Math.sin(offset) * distanceFromCenter;
          tries += 1;
        }
        this.bots.push(bot);
      }
      this.state = "playing";
      this.events.push({ type: "start" });
      return this;
    }

    get fighters() {
      return this.player ? [this.player, ...this.bots] : [];
    }

    get aliveFighters() {
      return this.fighters.filter((fighter) => fighter.alive);
    }

    get remainingBots() {
      return this.bots.filter((bot) => bot.alive).length;
    }

    getSnapshot() {
      return {
        state: this.state,
        elapsed: this.elapsed,
        kills: this.kills,
        remaining: this.remainingBots,
        alive: this.aliveFighters.length,
        player: this.player ? {
          hp: Math.max(0, this.player.hp),
          maxHp: this.player.maxHp,
          cubes: this.player.powerCubes,
          special: this.player.special,
          cooldown: this.player.cooldown,
          x: this.player.x,
          y: this.player.y,
          alive: this.player.alive,
        } : null,
        storm: { active: this.storm.active, radius: this.storm.radius },
      };
    }

    collidesWithSolid(x, y, radius) {
      if (x < radius || y < radius || x > MAP.width - radius || y > MAP.height - radius) return true;
      return this.obstacles.some((o) => {
        if (o.destroyed || o.kind === "bush") return false;
        const px = clamp(x, o.x, o.x + o.w);
        const py = clamp(y, o.y, o.y + o.h);
        return Math.hypot(x - px, y - py) < radius;
      });
    }

    move(fighter, dx, dy) {
      if (!fighter || !fighter.alive || fighter.stunned > 0) return;
      const length = Math.hypot(dx, dy);
      if (length > 1) { dx /= length; dy /= length; }
      const nx = fighter.x + dx;
      if (!this.collidesWithSolid(nx, fighter.y, fighter.radius)) fighter.x = nx;
      const ny = fighter.y + dy;
      if (!this.collidesWithSolid(fighter.x, ny, fighter.radius)) fighter.y = ny;
      fighter.x = clamp(fighter.x, fighter.radius, MAP.width - fighter.radius);
      fighter.y = clamp(fighter.y, fighter.radius, MAP.height - fighter.radius);
    }

    aim(fighter, angle) {
      if (fighter && Number.isFinite(angle)) fighter.angle = angle;
    }

    fire(fighter = this.player, angle = fighter ? fighter.angle : 0) {
      if (this.state !== "playing" || !fighter || !fighter.alive || fighter.cooldown > 0 || fighter.stunned > 0) return false;
      fighter.angle = angle;
      const hero = HEROES[fighter.heroId];
      const boost = 1 + fighter.powerCubes * 0.1;
      const speed = fighter.kind === "player" ? 710 : 565;
      const shots = hero.pattern === "triple" ? [-0.13, 0, 0.13]
        : hero.pattern === "fan" ? [-0.3, -0.15, 0, 0.15, 0.3] : [-0.045, 0.045];
      for (const offset of shots) {
        this.projectiles.push({
          id: `shot-${this.elapsed}-${this.projectiles.length}`,
          ownerId: fighter.id, team: fighter.kind, x: fighter.x, y: fighter.y,
          vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed,
          damage: fighter.damage * boost / shots.length * (hero.pattern === "fan" ? 1 : 1),
          life: fighter.range / speed, radius: 6, pierce: hero.pattern === "pierce" ? 2 : 0,
          color: hero.accent,
        });
      }
      fighter.cooldown = fighter.reload;
      this.particles.push({ type: "muzzle", x: fighter.x, y: fighter.y, angle, life: 0.15, maxLife: 0.15, color: hero.accent });
      return true;
    }

    activateSpecial(fighter = this.player, angle = fighter ? fighter.angle : 0) {
      if (this.state !== "playing" || !fighter || !fighter.alive || fighter.special < 100) return false;
      const heroId = fighter.heroId;
      fighter.special = 0;
      fighter.angle = angle;
      if (heroId === "mira") {
        fighter.invulnerable = 0.42;
        for (let i = 0; i < 9; i += 1) {
          const nx = fighter.x + Math.cos(angle) * 22;
          const ny = fighter.y + Math.sin(angle) * 22;
          if (this.collidesWithSolid(nx, ny, fighter.radius)) break;
          fighter.x = nx;
          fighter.y = ny;
          this.particles.push({ type: "dash", x: fighter.x, y: fighter.y, life: 0.36, maxLife: 0.36, color: "#9ffff0" });
        }
      } else if (heroId === "brasa") {
        this.particles.push({ type: "blast", x: fighter.x, y: fighter.y, life: 0.45, maxLife: 0.45, radius: 145, color: "#ffb15f" });
        for (const target of this.fighters) {
          if (!target.alive || target.id === fighter.id || distance(fighter, target) > 145) continue;
          this.damage(target, 50 + fighter.powerCubes * 4, fighter);
          const a = angleTo(fighter, target);
          this.move(target, Math.cos(a) * 76, Math.sin(a) * 76);
        }
      } else {
        let origin = fighter;
        for (let hit = 0; hit < 3; hit += 1) {
          const target = this.fighters
            .filter((candidate) => candidate.alive && candidate.id !== fighter.id &&
              !this.particles.some((p) => p.type === "shock-mark" && p.targetId === candidate.id) &&
              distance(origin, candidate) < 350 && this.lineClear(origin, candidate))
            .sort((a, b) => distance(origin, a) - distance(origin, b))[0];
          if (!target) break;
          target.stunned = Math.max(target.stunned, 0.58);
          this.damage(target, 42 + fighter.powerCubes * 3, fighter);
          this.particles.push({
            type: "lightning", x: origin.x, y: origin.y, x2: target.x, y2: target.y,
            life: 0.24, maxLife: 0.24, color: "#c9b4ff",
          });
          this.particles.push({ type: "shock-mark", targetId: target.id, life: 0.2, maxLife: 0.2 });
          origin = target;
        }
      }
      this.events.push({ type: "special", heroId, fighterId: fighter.id });
      return true;
    }

    lineClear(a, b) {
      const steps = Math.max(2, Math.ceil(distance(a, b) / 24));
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        if (this.obstacles.some((o) => !o.destroyed && o.kind === "rock" &&
          x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h)) return false;
      }
      return true;
    }

    isConcealed(fighter) {
      return this.obstacles.some((obstacle) => !obstacle.destroyed &&
        obstacle.kind === "bush" &&
        fighter.x > obstacle.x && fighter.x < obstacle.x + obstacle.w &&
        fighter.y > obstacle.y && fighter.y < obstacle.y + obstacle.h);
    }

    damage(target, amount, source) {
      if (!target.alive || target.invulnerable > 0) return;
      target.hp -= amount;
      target.flash = 0.12;
      target.lastHitBy = source ? source.id : null;
      if (source && source.id !== target.id) source.special = clamp(source.special + amount * 0.62, 0, 100);
      this.particles.push({
        type: "hit", x: target.x, y: target.y, life: 0.22, maxLife: 0.22,
        color: target.accent,
      });
      if (target.hp <= 0) this.eliminate(target, source);
    }

    eliminate(target, source) {
      if (!target.alive) return;
      target.alive = false;
      target.hp = 0;
      this.particles.push({
        type: "elimination", x: target.x, y: target.y, life: 0.8, maxLife: 0.8,
        radius: 72, color: target.accent,
      });
      const sourceId = source && source.id;
      if (sourceId === "player") {
        this.kills += 1;
        this.player.kills += 1;
      } else if (source && source.kind === "bot") source.kills += 1;
      const dropCount = Math.min(DIFFICULTIES[this.difficultyId].cubeDrop, Math.max(1, target.powerCubes + 1));
      for (let i = 0; i < dropCount; i += 1) {
        const a = this.random(0, Math.PI * 2);
        const r = this.random(8, 43);
        this.pickups.push({
          id: `drop-${target.id}-${i}-${this.elapsed}`,
          x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r,
          type: "cube", bob: this.random(0, Math.PI * 2),
        });
      }
      this.events.push({ type: "elimination", targetId: target.id, sourceId });
      this.checkOutcome();
    }

    breakCrate(crate, source) {
      if (crate.destroyed) return;
      crate.hp -= source ? source.damage : 12;
      crate.flash = 0.12;
      this.particles.push({ type: "wood", x: crate.x + crate.w / 2, y: crate.y + crate.h / 2, life: 0.3, maxLife: 0.3, color: "#edbb74" });
      if (crate.hp > 0) return;
      crate.destroyed = true;
      this.pickups.push({
        id: `crate-cube-${crate.id}`, x: crate.x + crate.w / 2, y: crate.y + crate.h / 2,
        type: "cube", bob: 0,
      });
      for (let i = 0; i < 10; i += 1) {
        this.particles.push({ type: "wood", x: crate.x + crate.w / 2, y: crate.y + crate.h / 2, life: 0.45, maxLife: 0.45, color: i % 2 ? "#d99854" : "#f1c27a" });
      }
      this.events.push({ type: "crate", id: crate.id, sourceId: source && source.id });
    }

    updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
        const shot = this.projectiles[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(shot.vx, shot.vy) * dt / 12));
        let remove = false;
        for (let step = 0; step < steps && !remove; step += 1) {
          shot.x += shot.vx * dt / steps;
          shot.y += shot.vy * dt / steps;
          for (const obstacle of this.obstacles) {
            if (obstacle.destroyed || obstacle.kind === "bush") continue;
            const px = clamp(shot.x, obstacle.x, obstacle.x + obstacle.w);
            const py = clamp(shot.y, obstacle.y, obstacle.y + obstacle.h);
            if (Math.hypot(shot.x - px, shot.y - py) > shot.radius) continue;
            if (obstacle.kind === "crate") this.breakCrate(obstacle, { damage: shot.damage, id: shot.ownerId });
            remove = true;
            break;
          }
          if (remove) break;
          const owner = this.fighters.find((fighter) => fighter.id === shot.ownerId);
          for (const target of this.fighters) {
            if (!target.alive || target.id === shot.ownerId) continue;
            if (Math.hypot(shot.x - target.x, shot.y - target.y) > shot.radius + target.radius) continue;
            this.damage(target, shot.damage, owner);
            this.particles.push({ type: "spark", x: shot.x, y: shot.y, life: 0.14, maxLife: 0.14, color: shot.color });
            if (shot.pierce > 0) shot.pierce -= 1;
            else remove = true;
            break;
          }
        }
        shot.life -= dt;
        if (remove || shot.life <= 0 || shot.x < 0 || shot.y < 0 || shot.x > MAP.width || shot.y > MAP.height) {
          this.projectiles.splice(i, 1);
        }
      }
    }

    updateBots(dt) {
      const config = DIFFICULTIES[this.difficultyId];
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        bot.cooldown = Math.max(0, bot.cooldown - dt);
        bot.stunned = Math.max(0, bot.stunned - dt);
        bot.invulnerable = Math.max(0, bot.invulnerable - dt);
        bot.flash = Math.max(0, bot.flash - dt);
        bot.brainClock -= dt;
        if (bot.stunned > 0) continue;
        const enemies = this.fighters.filter((f) => f.alive && f.id !== bot.id &&
          (!this.isConcealed(f) || distance(bot, f) < 190));
        let target = enemies.sort((a, b) => distance(bot, a) - distance(bot, b))[0];
        const nearbyCrate = this.obstacles
          .filter((o) => !o.destroyed && o.kind === "crate" && distance(bot, { x: o.x + o.w / 2, y: o.y + o.h / 2 }) < 340)
          .sort((a, b) => distance(bot, { x: a.x + a.w / 2, y: a.y + a.h / 2 }) -
            distance(bot, { x: b.x + b.w / 2, y: b.y + b.h / 2 }))[0];
        const targetDistance = target ? distance(bot, target) : Infinity;
        const wantsCrate = nearbyCrate && (bot.powerCubes === 0 || targetDistance > 530);
        if (bot.brainClock <= 0) {
          bot.strafe = this.rng() < 0.5 ? -1 : 1;
          bot.wander = this.random(0, Math.PI * 2);
          bot.brainClock = this.random(0.35, 0.75);
        }
        if (target) {
          const direction = angleTo(bot, target);
          bot.angle = direction;
          let approach = targetDistance > bot.range * 0.68 ? 1 : targetDistance < 155 ? -0.8 : 0;
          let vx = Math.cos(direction) * approach + Math.cos(direction + Math.PI / 2) * bot.strafe * 0.55;
          let vy = Math.sin(direction) * approach + Math.sin(direction + Math.PI / 2) * bot.strafe * 0.55;
          const incoming = this.projectiles.find((p) => p.ownerId !== bot.id &&
            this.willHit(p, bot));
          if (incoming) {
            vx += Math.cos(direction + Math.PI / 2) * bot.strafe * 1.7;
            vy += Math.sin(direction + Math.PI / 2) * bot.strafe * 1.7;
          }
          const oldX = bot.x, oldY = bot.y;
          this.move(bot, vx * bot.speed * dt, vy * bot.speed * dt);
          if (Math.hypot(bot.x - oldX, bot.y - oldY) < 0.1) {
            bot.strafe *= -1;
            this.move(bot, Math.cos(direction + Math.PI / 2) * bot.speed * dt,
              Math.sin(direction + Math.PI / 2) * bot.speed * dt);
          }
          if (targetDistance < bot.range && bot.cooldown <= 0 && this.lineClear(bot, target)) {
            const lead = clamp(targetDistance / 700, 0, 0.24);
            const predicted = angleTo(bot, { x: target.x + Math.cos(target.angle || 0) * target.speed * lead,
              y: target.y + Math.sin(target.angle || 0) * target.speed * lead });
            this.fire(bot, predicted + this.random(-config.accuracy, config.accuracy));
          }
          if (bot.special >= 100 && targetDistance < 310) this.activateSpecial(bot, direction);
        } else if (wantsCrate) {
          const cx = nearbyCrate.x + nearbyCrate.w / 2;
          const cy = nearbyCrate.y + nearbyCrate.h / 2;
          const direction = Math.atan2(cy - bot.y, cx - bot.x);
          bot.angle = direction;
          this.move(bot, Math.cos(direction) * bot.speed * dt, Math.sin(direction) * bot.speed * dt);
          if (distance(bot, { x: cx, y: cy }) < 300 && bot.cooldown <= 0) this.fire(bot, direction);
        } else {
          bot.angle = bot.wander;
          this.move(bot, Math.cos(bot.wander) * bot.speed * 0.24 * dt,
            Math.sin(bot.wander) * bot.speed * 0.24 * dt);
        }
      }
    }

    willHit(projectile, fighter) {
      const speedSq = projectile.vx * projectile.vx + projectile.vy * projectile.vy;
      if (!speedSq) return false;
      const t = clamp(((fighter.x - projectile.x) * projectile.vx +
        (fighter.y - projectile.y) * projectile.vy) / speedSq, 0, 0.4);
      return Math.hypot(projectile.x + projectile.vx * t - fighter.x,
        projectile.y + projectile.vy * t - fighter.y) < fighter.radius + 30;
    }

    updateStorm(dt) {
      if (this.mode === "training") return;
      if (this.elapsed < this.storm.startsAt) return;
      this.storm.active = true;
      const progress = clamp((this.elapsed - this.storm.startsAt) / this.storm.duration, 0, 1);
      this.storm.radius = this.storm.startRadius +
        (this.storm.endRadius - this.storm.startRadius) * progress;
      for (const fighter of this.aliveFighters) {
        if (distance(fighter, this.storm) <= this.storm.radius) {
          fighter.stormClock = 0;
          continue;
        }
        fighter.stormClock += dt;
        if (fighter.stormClock >= 0.55) {
          fighter.stormClock = 0;
          this.damage(fighter, this.storm.damagePerSecond * 0.55, null);
        }
      }
    }

    updatePickups(dt) {
      for (const pickup of this.pickups) {
        pickup.bob = (pickup.bob || 0) + dt * 4;
        const fighter = this.aliveFighters.find((f) => distance(f, pickup) < f.radius + 24);
        if (!fighter) continue;
        fighter.powerCubes += 1;
        fighter.maxHp += 82;
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + 82);
        fighter.damage += 2.1;
        this.particles.push({ type: "cube", x: pickup.x, y: pickup.y, life: 0.35, maxLife: 0.35, color: "#b8f461" });
        pickup.collected = true;
        this.events.push({ type: "cube", fighterId: fighter.id, count: fighter.powerCubes });
      }
      this.pickups = this.pickups.filter((pickup) => !pickup.collected);
    }

    updateParticles(dt) {
      for (const particle of this.particles) {
        particle.life -= dt;
        if (particle.type === "shock-mark" && particle.life <= 0) particle.remove = true;
      }
      this.particles = this.particles.filter((particle) => particle.life > 0 && particle.type !== "shock-mark");
      for (const fighter of this.fighters) {
        fighter.bob += dt * (fighter.alive ? 7 : 0);
        fighter.flash = Math.max(0, fighter.flash - dt);
        fighter.cooldown = Math.max(0, fighter.cooldown - dt);
        fighter.stunned = Math.max(0, fighter.stunned - dt);
        fighter.invulnerable = Math.max(0, fighter.invulnerable - dt);
      }
    }

    checkOutcome() {
      if (this.state !== "playing") return;
      if (!this.player || !this.player.alive) {
        this.state = "lost";
        this.events.push({ type: "end", result: "lost" });
      } else if (this.aliveFighters.length <= 1) {
        this.state = "won";
        this.events.push({ type: "end", result: "won" });
      }
    }

    update(dt) {
      if (this.state !== "playing") return;
      dt = clamp(dt, 0, 0.08);
      this.elapsed += dt;
      this.updateParticles(dt);
      this.updateBots(dt);
      this.updateProjectiles(dt);
      this.updatePickups(dt);
      this.updateStorm(dt);
      this.checkOutcome();
    }
  }

  return { ArenaGame, HEROES, DIFFICULTIES, MAP, clamp, distance, angleTo };
});
