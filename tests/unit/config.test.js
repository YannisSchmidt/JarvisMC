'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeConfig, loadConfig, ConfigError } = require('../../src/config');

const example = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config.example.json'), 'utf8'));

test('config.example.json est valide', () => {
  const cfg = normalizeConfig(example);
  assert.equal(cfg.bot.version, '1.21.1');
  assert.equal(cfg.behavior.owner, null, 'le placeholder PLAYER_NAME doit devenir null');
  assert.equal(cfg.ai.model, null, 'le placeholder MODEL_NAME doit devenir null');
});

test('les valeurs manquantes prennent les défauts', () => {
  const cfg = normalizeConfig({ bot: { username: 'Jarvis_1' } });
  assert.equal(cfg.bot.username, 'Jarvis_1');
  assert.equal(cfg.bot.port, 25565);
  assert.equal(cfg.logging.level, 'INFO');
});

test('pseudo invalide refusé', () => {
  assert.throws(() => normalizeConfig({ bot: { username: 'a b!' } }), ConfigError);
  assert.throws(() => normalizeConfig({ bot: { username: 'ab' } }), ConfigError);
});

test('port et auth invalides refusés', () => {
  assert.throws(() => normalizeConfig({ bot: { port: 70000 } }), /port/);
  assert.throws(() => normalizeConfig({ bot: { auth: 'steam' } }), /bot.auth/);
});

test('liste des problèmes complète', () => {
  try {
    normalizeConfig({ bot: { port: 'x', auth: 'nope' }, logging: { level: 'TRACE' } });
    assert.fail('aurait dû lever une erreur');
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    assert.ok(err.problems.length >= 3);
  }
});

test('loadConfig lit un fichier et signale un fichier absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-cfg-'));
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ bot: { host: '192.168.1.5', port: 25566 } }));
  const cfg = loadConfig(file);
  assert.equal(cfg.bot.host, '192.168.1.5');
  assert.equal(cfg.bot.port, 25566);
  assert.throws(() => loadConfig(path.join(dir, 'absent.json')), /config.example.json/);
  fs.writeFileSync(file, '{ pas du json');
  assert.throws(() => loadConfig(file), /JSON invalide/);
});
