'use strict';
/**
 * Test sur un VRAI serveur Minecraft. Ignoré sauf si JARVIS_TEST_SERVER est défini :
 *   JARVIS_TEST_SERVER=localhost:25565 JARVIS_TEST_VERSION=1.21.1 npm run test:integration
 * Le serveur doit être en mode offline (auth "offline").
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { JarvisBot } = require('../../src/core/bot');
const { createModules } = require('../../src/modules');
const { normalizeConfig } = require('../../src/config');
const { resolveVersion } = require('../../src/adapters/version');
const { configureLogger } = require('../../src/core/logger');

const target = process.env.JARVIS_TEST_SERVER;
const skip = target ? false : 'JARVIS_TEST_SERVER non défini';

configureLogger({ level: 'WARN', file: null });

test('connexion, spawn et commande !status sur serveur réel', { skip, timeout: 90000 }, async () => {
  const [host, portStr] = target.split(':');
  const config = normalizeConfig({
    bot: {
      host,
      port: Number(portStr || 25565),
      username: process.env.JARVIS_TEST_USERNAME || 'JarvisTest',
      version: process.env.JARVIS_TEST_VERSION || '1.21.1',
      auth: 'offline',
    },
    behavior: { autoReconnect: false, owner: 'nobody' },
    logging: { level: 'WARN', file: null },
  });
  const jarvis = new JarvisBot({ config, versionProfile: resolveVersion(config.bot.version), modules: createModules() });
  const spawned = new Promise((resolve) => jarvis.once('ready', resolve));
  jarvis.start();
  await spawned;
  assert.equal(jarvis.connected, true);
  assert.ok(jarvis.mc.entity && jarvis.mc.entity.position, 'position connue après spawn');
  jarvis.stop('fin du test');
});
