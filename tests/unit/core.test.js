'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reconnectDelay } = require('../../src/core/backoff');
const { parseCommand, CommandRegistry } = require('../../src/core/commands');
const { roleOf, hasRank, ROLES } = require('../../src/core/permissions');
const { TaskManager } = require('../../src/core/tasks');
const { splitForChat } = require('../../src/core/bot');
const { toCommandLine } = require('../../src/cli');
const { parseCoords } = require('../../src/modules/movement');
const { summarizeItems } = require('../../src/modules/inventory');

test('backoff exponentiel borné', () => {
  assert.equal(reconnectDelay(1, 2000, 60000), 2000);
  assert.equal(reconnectDelay(2, 2000, 60000), 4000);
  assert.equal(reconnectDelay(3, 2000, 60000), 8000);
  assert.equal(reconnectDelay(10, 2000, 60000), 60000);
});

test('parsing des commandes "!"', () => {
  assert.deepEqual(parseCommand('!goto 10 64 -20'), { name: 'goto', args: ['10', '64', '-20'] });
  assert.deepEqual(parseCommand('  !STATUS  '), { name: 'status', args: [] });
  assert.equal(parseCommand('bonjour !'), null);
  assert.equal(parseCommand('!'), null);
  assert.equal(parseCommand(42), null);
});

test('registre : rôles, alias, commande inconnue, pause', async () => {
  const reg = new CommandRegistry();
  reg.register({ name: 'ping', aliases: ['p'], minRole: 'PLAYER', run: () => 'pong' });
  reg.register({ name: 'boom', minRole: 'OWNER', run: () => 'x' });
  reg.register({ name: 'move', minRole: 'TRUSTED', action: true, run: () => 'ok' });

  assert.equal((await reg.execute('!p', { role: ROLES.PLAYER, connected: true })).reply, 'pong');
  assert.match((await reg.execute('!boom', { role: ROLES.TRUSTED, connected: true })).reply, /réservée/);
  assert.match((await reg.execute('!nope', { role: ROLES.OWNER, connected: true })).reply, /inconnue/);
  assert.equal((await reg.execute('salut', { role: ROLES.OWNER, connected: true })).handled, false);
  assert.match((await reg.execute('!move', { role: ROLES.OWNER, connected: true, paused: true })).reply, /pause/);
  assert.equal((await reg.execute('!ping', { role: ROLES.OWNER, connected: true, paused: true })).reply, 'pong');
});

test('registre : une erreur d\'exécution est rapportée, pas levée', async () => {
  const reg = new CommandRegistry();
  reg.register({ name: 'fail', run: () => { throw new Error('pathfinder cassé'); } });
  assert.equal((await reg.execute('!fail', { role: ROLES.OWNER, connected: true })).reply, 'Échec : pathfinder cassé');
});

test('registre : doublon refusé', () => {
  const reg = new CommandRegistry();
  reg.register({ name: 'a', run: () => {} });
  assert.throws(() => reg.register({ name: 'a', run: () => {} }), /déjà enregistrée/);
});

test('rôles selon la configuration', () => {
  const behavior = { owner: 'Yannis', trusted: ['Alice'], blocked: ['Troll'] };
  assert.equal(roleOf('yannis', behavior), ROLES.OWNER);
  assert.equal(roleOf('Alice', behavior), ROLES.TRUSTED);
  assert.equal(roleOf('Troll', behavior), ROLES.HOSTILE);
  assert.equal(roleOf('Bob', behavior), ROLES.PLAYER);
  assert.equal(roleOf(null, behavior), ROLES.UNKNOWN);
  assert.equal(hasRank(ROLES.CONSOLE, ROLES.OWNER), true);
  assert.equal(hasRank(ROLES.PLAYER, ROLES.TRUSTED), false);
});

test('gestionnaire de tâches : une seule à la fois, statuts corrects', async () => {
  const tm = new TaskManager();
  const done = await tm.start('ok', async () => {});
  assert.equal(done.status, 'done');

  const failed = await tm.start('ko', async () => { throw new Error('nope'); });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'nope');

  const pending = tm.start('long', (signal) => new Promise((resolve) => signal.addEventListener('abort', resolve)));
  await assert.rejects(tm.start('deux', async () => {}), /déjà en cours/);
  assert.equal(tm.describe().name, 'long');
  assert.equal(tm.cancel(), true);
  assert.equal((await pending).status, 'cancelled');
  assert.equal(tm.describe().active, false);
  assert.equal(tm.cancel(), false);
});

test('découpage des messages pour le chat', () => {
  const chunks = splitForChat('mot '.repeat(120), 50);
  assert.ok(chunks.every((c) => c.length <= 50));
  assert.deepEqual(splitForChat('court'), ['court']);
});

test('CLI : raccourcis sans "!"', () => {
  const names = new Set(['status', 'goto', 'craft', 'help']);
  assert.equal(toCommandLine('status', names), '!status');
  assert.equal(toCommandLine('goto 1 2 3', names), '!goto 1 2 3');
  assert.equal(toCommandLine('craft iron_pickaxe 1', names), '!craft iron_pickaxe 1');
  assert.equal(toCommandLine('!help', names), '!help');
  assert.equal(toCommandLine('blabla', names), null);
  assert.equal(toCommandLine('   ', names), null);
});

test('coordonnées de !goto', () => {
  assert.deepEqual(parseCoords(['1', '64', '-3.5']), { x: 1, y: 64, z: -3.5 });
  assert.equal(parseCoords(['1', '2']), null);
  assert.equal(parseCoords(['a', 'b', 'c']), null);
});

test('résumé d\'inventaire trié et agrégé', () => {
  const s = summarizeItems([
    { name: 'oak_log', count: 10 },
    { name: 'cobblestone', count: 64 },
    { name: 'oak_log', count: 5 },
  ]);
  assert.deepEqual(s, [
    { name: 'cobblestone', count: 64 },
    { name: 'oak_log', count: 15 },
  ]);
  assert.deepEqual(summarizeItems(null), []);
});

test('commande nécessitant le bot refusée hors ligne (pas de fausse exécution)', async () => {
  const reg = new CommandRegistry();
  let ran = false;
  reg.register({ name: 'goto', run: () => { ran = true; return 'ok'; } });
  reg.register({ name: 'help', needsBot: false, run: () => 'aide' });
  const offline = await reg.execute('!goto 1 2 3', { role: ROLES.OWNER, connected: false });
  assert.match(offline.reply, /pas connecté/);
  assert.equal(ran, false);
  assert.equal((await reg.execute('!help', { role: ROLES.OWNER, connected: false })).reply, 'aide');
});
