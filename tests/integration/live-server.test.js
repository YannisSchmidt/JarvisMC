'use strict';
/**
 * Test sur un VRAI serveur Minecraft 1.21.1 (lancé par la CI ou par vous).
 * Ignoré sauf si JARVIS_TEST_SERVER est défini :
 *   JARVIS_TEST_SERVER=localhost:25565 JARVIS_TEST_VERSION=1.21.1 npm run test:live
 * Le serveur doit être en mode offline (online-mode=false) et en difficulté paisible.
 *
 * Scénario : connexion → !status → récolte de 4 bûches → fabrication d'une pioche
 * en bois → déplacement vérifié. Chaque étape vérifie l'état réel (inventaire, position).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { JarvisBot } = require('../../src/core/bot');
const { createModules } = require('../../src/modules');
const { normalizeConfig } = require('../../src/config');
const { resolveVersion } = require('../../src/adapters/version');
const { configureLogger, createLogger } = require('../../src/core/logger');
const { MemoryStore } = require('../../src/memory/store');
const { ROLES } = require('../../src/core/permissions');
const { GoalNear } = require('mineflayer-pathfinder').goals;

const target = process.env.JARVIS_TEST_SERVER;
const skip = target ? false : 'JARVIS_TEST_SERVER non défini';
const TASK_TIMEOUT_MS = 240000;

configureLogger({ level: 'INFO', file: 'logs/live-test.log' });

/** Attend qu'une condition soit vraie (sondage simple). */
async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`délai dépassé : ${label}`);
}

const logsCount = (mc) => mc.inventory.items().filter((i) => i.name.endsWith('_log')).reduce((s, i) => s + i.count, 0);

test('serveur réel : connexion, statut, récolte, craft, déplacement', { skip, timeout: 15 * 60 * 1000 }, async () => {
  const [host, portStr] = target.split(':');
  const config = normalizeConfig({
    bot: {
      host,
      port: Number(portStr || 25565),
      username: process.env.JARVIS_TEST_USERNAME || 'JarvisTest',
      version: process.env.JARVIS_TEST_VERSION || '1.21.1',
      auth: 'offline',
    },
    behavior: { autoReconnect: false, owner: 'nobody', autoDefend: false, autoSleep: false },
    logging: { level: 'INFO', file: 'logs/live-test.log' },
  });
  const jarvis = new JarvisBot({
    config,
    versionProfile: resolveVersion(config.bot.version),
    modules: createModules(),
    memory: new MemoryStore(null),
  });
  const log = createLogger('LIVE');
  try {
    // 1. Connexion et spawn
    const spawned = new Promise((resolve) => jarvis.once('ready', resolve));
    jarvis.start();
    await Promise.race([spawned, new Promise((_, rej) => setTimeout(() => rej(new Error('pas de spawn en 120 s')), 120000))]);
    const mc = jarvis.mc;
    assert.equal(jarvis.connected, true);
    await waitFor(() => mc.entity && mc.entity.position, 30000, 'position connue');
    log.info(`Spawn à ${mc.entity.position}`);

    // 2. Statut (commande directe, rôle console)
    const ctx = { username: 'console', role: ROLES.CONSOLE, bot: mc, connected: true, jarvis, services: jarvis.services, paused: false };
    const status = await jarvis.commands.execute('!status', ctx);
    assert.match(status.reply, /Pos \-?\d+/, status.reply);

    // 3. Récolte réelle de 4 bûches
    const before = logsCount(mc);
    await jarvis.commands.execute('!collect log 4', ctx);
    await waitFor(() => !jarvis.tasks.describe().active, TASK_TIMEOUT_MS, 'fin de la récolte');
    const gained = logsCount(mc) - before;
    assert.ok(gained >= 4, `bûches obtenues : ${gained} (attendu >= 4)`);

    // 4. Craft réel : pioche en bois (table posée automatiquement si nécessaire)
    await jarvis.commands.execute('!craft wooden_pickaxe 1', ctx);
    await waitFor(() => !jarvis.tasks.describe().active, TASK_TIMEOUT_MS, 'fin du craft');
    const hasPickaxe = mc.inventory.items().some((i) => i.name === 'wooden_pickaxe');
    assert.ok(hasPickaxe, 'la pioche en bois doit être dans l\'inventaire');

    // 5. Déplacement vérifié
    const p = mc.entity.position;
    const tx = Math.floor(p.x) + 3;
    const tz = Math.floor(p.z);
    await mc.pathfinder.goto(new GoalNear(tx, Math.floor(p.y), tz, 2));
    const d = Math.hypot(mc.entity.position.x - tx, mc.entity.position.z - tz);
    assert.ok(d <= 3, `arrivée à ${d.toFixed(1)} blocs de la cible`);
  } finally {
    jarvis.stop('fin du test');
    await new Promise((r) => setTimeout(r, 500));
  }
});
