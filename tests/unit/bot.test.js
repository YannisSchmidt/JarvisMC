'use strict';
/**
 * Tests du cœur JarvisBot avec une fausse instance Mineflayer (EventEmitter).
 * Vérifie routage, permissions, arrêt et reconnexion sans serveur.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { JarvisBot } = require('../../src/core/bot');
const { createGeneralModule } = require('../../src/modules/general');
const { normalizeConfig } = require('../../src/config');
const { resolveVersion } = require('../../src/adapters/version');
const { configureLogger } = require('../../src/core/logger');

configureLogger({ level: 'ERROR', file: null });

function fakeMc(username = 'BestFriendBot') {
  const mc = new EventEmitter();
  mc.username = username;
  mc.chatLog = [];
  mc.chat = (m) => mc.chatLog.push(m);
  mc.quit = () => mc.emit('end', 'quit');
  mc.health = 20;
  mc.food = 20;
  mc.entity = { position: { x: 1, y: 64, z: 2, floored: 0 } };
  mc.inventory = { items: () => [] };
  mc.registry = { foods: {} };
  return mc;
}

function makeBot({ behavior = {}, bots = [] } = {}) {
  const config = normalizeConfig({
    behavior: { owner: 'Yannis', reconnectBaseDelayMs: 5, reconnectMaxDelayMs: 10, ...behavior },
    logging: { level: 'ERROR', file: null },
  });
  const jarvis = new JarvisBot({
    config,
    versionProfile: resolveVersion('1.21.11'),
    modules: [createGeneralModule()],
    createBot: () => {
      const mc = fakeMc();
      bots.push(mc);
      return mc;
    },
  });
  return { jarvis, config, bots };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

test('spawn → connecté ; commande du propriétaire → réponse dans le chat', async () => {
  const bots = [];
  const { jarvis } = makeBot({ bots });
  jarvis.start();
  const mc = bots[0];
  mc.emit('spawn');
  assert.equal(jarvis.connected, true);

  mc.emit('chat', 'Yannis', '!status');
  await tick();
  assert.ok(mc.chatLog.some((m) => m.startsWith('Pos 1 64 2')), mc.chatLog.join(' / '));
});

test('les messages du bot lui-même et des joueurs bloqués sont ignorés', async () => {
  const bots = [];
  const { jarvis } = makeBot({ bots, behavior: { blocked: ['Troll'] } });
  jarvis.start();
  const mc = bots[0];
  mc.emit('spawn');
  mc.emit('chat', 'BestFriendBot', '!help');
  mc.emit('chat', 'Troll', '!help');
  await tick();
  assert.equal(mc.chatLog.length, 0);
});

test('un joueur simple ne peut pas utiliser les commandes réservées', async () => {
  const bots = [];
  const { jarvis } = makeBot({ bots });
  jarvis.start();
  const mc = bots[0];
  mc.emit('spawn');
  mc.emit('chat', 'Bob', '!stop');
  await tick();
  assert.match(mc.chatLog.join(' '), /réservée/);
  assert.equal(jarvis.paused, false);
});

test('!stop met en pause, !resume reprend', async () => {
  const bots = [];
  const { jarvis } = makeBot({ bots });
  jarvis.start();
  const mc = bots[0];
  mc.emit('spawn');
  mc.emit('chat', 'Yannis', '!stop');
  await tick();
  assert.equal(jarvis.paused, true);
  mc.emit('chat', 'Yannis', '!resume');
  await tick();
  assert.equal(jarvis.paused, false);
});

test('déconnexion → reconnexion automatique ; stop() empêche la reconnexion', async () => {
  const bots = [];
  const { jarvis } = makeBot({ bots });
  jarvis.start();
  bots[0].emit('spawn');
  bots[0].emit('end', 'Connection lost');
  assert.equal(jarvis.mc, null);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(bots.length, 2, 'une nouvelle connexion doit être créée');

  jarvis.stop('test');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(bots.length, 2, 'pas de reconnexion après stop()');
});

test('autoReconnect désactivé → pas de nouvelle tentative', async () => {
  const bots = [];
  const { jarvis } = makeBot({ bots, behavior: { autoReconnect: false } });
  jarvis.start();
  bots[0].emit('end', 'x');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(bots.length, 1);
});

test('!help ne liste que les commandes accessibles au rôle', async () => {
  const bots = [];
  const { jarvis } = makeBot({ bots });
  jarvis.start();
  const mc = bots[0];
  mc.emit('spawn');
  mc.emit('chat', 'Bob', '!help');
  await tick();
  const reply = mc.chatLog.join(' ');
  assert.match(reply, /!status/);
  assert.doesNotMatch(reply, /!quit/);
});
