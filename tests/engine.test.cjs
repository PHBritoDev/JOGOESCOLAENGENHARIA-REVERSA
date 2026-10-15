const test = require("node:test");
const assert = require("node:assert/strict");
const { ArenaGame, MAP } = require("../js/engine.js");

function seeded(seed = 7919) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createGame(options = {}) {
  return new ArenaGame({ rng: seeded(), ...options }).start();
}

test("starts a full solo match with the selected fighter and difficulty roster", () => {
  const game = createGame({ hero: "volta", difficulty: "normal" });
  assert.equal(game.state, "playing");
  assert.equal(game.player.heroId, "volta");
  assert.equal(game.bots.length, 8);
  assert.equal(game.aliveFighters.length, 9);
  assert.equal(game.collidesWithSolid(game.player.x, game.player.y, game.player.radius), false);
  assert.ok(game.bots.every((bot) => bot.x > bot.radius && bot.x < MAP.width - bot.radius));
  assert.ok(game.bots.every((bot) => bot.y > bot.radius && bot.y < MAP.height - bot.radius));
});

test("difficulty, training mode, and character attacks have distinct behavior", () => {
  const light = createGame({ difficulty: "easy", mode: "training", hero: "mira" });
  assert.equal(light.bots.length, 4);
  assert.equal(light.storm.startsAt, Infinity);
  assert.equal(light.fire(light.player, 0), true);
  assert.equal(light.projectiles.length, 3);
  assert.equal(light.fire(light.player, 0), false, "weapon reload prevents a second volley");

  const heavy = createGame({ hero: "brasa" });
  assert.equal(heavy.fire(heavy.player, 0), true);
  assert.equal(heavy.projectiles.length, 5);

  const piercer = createGame({ hero: "volta" });
  assert.equal(piercer.fire(piercer.player, 0), true);
  assert.equal(piercer.projectiles.length, 2);
  assert.ok(piercer.projectiles.every((shot) => shot.pierce === 2));
});

test("bots damage and eliminate other bots instead of focusing only on the player", () => {
  const game = createGame({ difficulty: "normal" });
  game.player.x = 1450;
  game.player.y = 1030;
  const [first, second] = game.bots;
  first.x = 700; first.y = 690; first.cooldown = 0;
  second.x = 865; second.y = 690; second.cooldown = 0;
  for (const bot of game.bots.slice(2)) bot.alive = false;
  const initial = [first.hp, second.hp];
  for (let i = 0; i < 90 && first.alive && second.alive; i += 1) game.update(0.055);
  assert.ok(first.hp < initial[0] || second.hp < initial[1], "at least one rival should take damage");
  assert.ok(game.events.some((event) => event.type === "elimination" && event.sourceId !== "player") ||
    first.hp < initial[0] || second.hp < initial[1]);
});

test("destroying a supply crate releases a power cube and cubes strengthen the player", () => {
  const game = createGame({ hero: "mira", difficulty: "easy" });
  game.player.x = 200; game.player.y = 200;
  for (const bot of game.bots) {
    bot.alive = bot.id === game.bots[0].id;
    if (bot.alive) { bot.x = 1650; bot.y = 1120; bot.cooldown = 999; }
  }
  const crate = { id: "test-crate", x: 300, y: 170, w: 58, h: 60, kind: "crate", hp: 72, maxHp: 72, destroyed: false };
  game.obstacles = [crate];
  for (let volley = 0; volley < 6 && !crate.destroyed; volley += 1) {
    if (game.player.cooldown <= 0) game.fire(game.player, 0);
    for (let step = 0; step < 5; step += 1) game.update(0.08);
  }
  assert.equal(crate.destroyed, true);
  assert.ok(game.pickups.some((pickup) => pickup.id === "crate-cube-test-crate"));
  const maxBefore = game.player.maxHp;
  const damageBefore = game.player.damage;
  game.pickups.push({ id: "test-power-cube", x: game.player.x, y: game.player.y, type: "cube", bob: 0 });
  game.update(0.016);
  assert.equal(game.player.powerCubes, 1);
  assert.equal(game.player.maxHp, maxBefore + 82);
  assert.ok(game.player.damage > damageBefore);
});

test("special abilities are active combat actions and the storm damages fighters outside the zone", () => {
  const brasa = createGame({ hero: "brasa", difficulty: "easy" });
  const target = brasa.bots[0];
  target.x = brasa.player.x + 90; target.y = brasa.player.y;
  for (const bot of brasa.bots.slice(1)) bot.alive = false;
  target.cooldown = 999;
  target.special = 0;
  brasa.player.special = 100;
  const hpBefore = target.hp;
  assert.equal(brasa.activateSpecial(brasa.player, 0), true);
  assert.ok(target.hp < hpBefore);
  assert.ok(brasa.player.special < 100, "the special spends its charge before its damage can recharge part of it");

  const stormGame = createGame({ difficulty: "easy" });
  stormGame.player.x = 30; stormGame.player.y = 30;
  for (const bot of stormGame.bots) { bot.x = 1700; bot.y = 1120; bot.cooldown = 999; }
  stormGame.elapsed = stormGame.storm.startsAt - 0.01;
  const healthBeforeStorm = stormGame.player.hp;
  for (let i = 0; i < 10; i += 1) stormGame.update(0.08);
  assert.equal(stormGame.storm.active, true);
  assert.ok(stormGame.player.hp < healthBeforeStorm);
});

test("each super has its own effect and a charged Brasa bot uses its super on a nearby rival", () => {
  const dash = createGame({ hero: "mira", difficulty: "easy" });
  dash.obstacles = [];
  dash.player.special = 100;
  const startX = dash.player.x;
  assert.equal(dash.activateSpecial(dash.player, 0), true);
  assert.ok(dash.player.x > startX + 150);
  assert.ok(dash.player.invulnerable > 0);

  const shock = createGame({ hero: "volta", difficulty: "easy" });
  shock.obstacles = [];
  const chainTargets = shock.bots.slice(0, 3);
  chainTargets.forEach((bot, index) => {
    bot.x = shock.player.x + 80 + index * 90;
    bot.y = shock.player.y;
  });
  for (const bot of shock.bots.slice(3)) bot.alive = false;
  const chainHealth = chainTargets.map((bot) => bot.hp);
  shock.player.special = 100;
  assert.equal(shock.activateSpecial(shock.player, 0), true);
  assert.ok(chainTargets.every((bot, index) => bot.hp < chainHealth[index] && bot.stunned > 0));

  const botGame = createGame({ difficulty: "easy" });
  botGame.obstacles = [];
  for (const bot of botGame.bots) bot.alive = false;
  const brasaBot = botGame.bots[1];
  brasaBot.alive = true;
  brasaBot.x = botGame.player.x + 80;
  brasaBot.y = botGame.player.y;
  brasaBot.cooldown = 999;
  brasaBot.special = 100;
  const playerHealth = botGame.player.hp;
  botGame.updateBots(0.016);
  assert.ok(botGame.player.hp < playerHealth);
  assert.ok(botGame.events.some((event) => event.type === "special" && event.fighterId === brasaBot.id));
});

test("rock cover blocks movement, then the last rival ending resolves as a win", () => {
  const game = createGame({ difficulty: "easy" });
  const rock = game.obstacles.find((obstacle) => obstacle.kind === "rock");
  const startX = rock.x - game.player.radius - 1;
  game.player.x = startX;
  game.player.y = rock.y + rock.h / 2;
  game.move(game.player, 100, 0);
  assert.ok(game.player.x <= rock.x - game.player.radius + 1, "solid cover should stop the move before the rock");

  for (const bot of game.bots) bot.alive = false;
  const finalBot = game.bots[0];
  finalBot.alive = true;
  game.state = "playing";
  game.eliminate(finalBot, game.player);
  assert.equal(game.state, "won");
});
