#!/usr/bin/env node
'use strict';
/**
 * Point d'entrée JarvisMC.
 *   node src/index.js [--config chemin/config.json]
 */
const path = require('path');
const { boot } = require('./core/boot');
const { JarvisBot } = require('./core/bot');
const { startCli } = require('./cli');
const { createLogger } = require('./core/logger');

function parseArgs(argv) {
  const args = { configPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config' && argv[i + 1]) {
      args.configPath = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const log = createLogger('MAIN');
  let prepared;
  try {
    prepared = boot(parseArgs(argv));
  } catch (err) {
    createLogger('BOOT').error(err.message);
    process.exitCode = 1;
    return null;
  }

  const jarvis = new JarvisBot(prepared);
  let shuttingDown = false;
  const shutdown = (reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Arrêt : ${reason}`);
    jarvis.stop(reason);
    setTimeout(() => process.exit(0), 500).unref();
  };

  jarvis.on('shutdown-requested', () => shutdown('demande de !quit'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => createLogger('ERROR').error(String(err && err.stack ? err.stack : err)));

  startCli(jarvis);
  createLogger('BOT').info('Connecting...');
  jarvis.start();
  return jarvis;
}

if (require.main === module) main();

module.exports = { main, parseArgs };
