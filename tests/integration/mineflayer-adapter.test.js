'use strict';
/**
 * Test d'intégration de l'adaptateur Mineflayer réel : aucun serveur n'écoute sur le port,
 * donc la connexion doit échouer et JarvisBot doit retenter avec le backoff configuré.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { JarvisBot } = require('../../src/core/bot');
const { createModules } = require('../../src/modules');
const { normalizeConfig } = require('../../src/config');
const { resolveVersion } = require('../../src/adapters/version');
const { configureLogger } = require('../../src/core/logger');

configureLogger({ level: 'ERROR', file: null });

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

test('connexion réelle refusée → reconnexions successives', async () => {
  const port = await freePort();
  const config = normalizeConfig({
    bot: { host: '127.0.0.1', port, username: 'JarvisTest', version: '1.21.11' },
    behavior: { owner: 'Yannis', reconnectBaseDelayMs: 20, reconnectMaxDelayMs: 40 },
    logging: { level: 'ERROR', file: null },
  });
  const jarvis = new JarvisBot({
    config,
    versionProfile: resolveVersion('1.21.11'),
    modules: createModules(),
  });
  let attempts = 0;
  const original = jarvis.connect.bind(jarvis);
  jarvis.connect = () => {
    attempts += 1;
    original();
  };
  jarvis.start();

  const deadline = Date.now() + 15000;
  while (attempts < 3 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  jarvis.stop('fin du test');
  assert.ok(attempts >= 3, `attendu >= 3 tentatives, obtenu ${attempts}`);
  assert.equal(jarvis.connected, false);
});
