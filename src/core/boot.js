'use strict';
/**
 * Séquence de démarrage : tout est préparé AVANT la connexion Minecraft.
 * Affiche l'état de chaque composant (READY) puis renvoie les objets prêts à l'emploi.
 */
const path = require('path');
const { loadConfig } = require('../config');
const { configureLogger, createLogger } = require('./logger');
const { resolveVersion } = require('../adapters/version');
const { createModules } = require('../modules');

/**
 * @param {{configPath?: string}} opts
 * @returns {{config, versionProfile, modules}}
 * @throws en cas d'erreur de configuration ou de version non supportée
 */
function boot({ configPath } = {}) {
  const log = createLogger('BOOT');
  const file = configPath || path.resolve(process.cwd(), 'config.json');

  log.info('Loading...');
  const config = loadConfig(file);
  configureLogger(config.logging);
  log.info(`Configuration chargée : ${file}`);

  const versionProfile = resolveVersion(config.bot.version);
  createLogger('VERSION').info(
    `Minecraft ${versionProfile.minecraftVersion} supporté (protocole ${versionProfile.protocolVersion}, données ${versionProfile.dataVersion})`
  );

  if (config.ai.enabled) {
    createLogger('AI').warn(
      `Provider "${config.ai.provider}" demandé mais la compréhension du langage naturel n'est pas encore implémentée — mode AI OFFLINE`
    );
  } else {
    createLogger('AI').info('Désactivée — mode AI OFFLINE (commandes "!" uniquement)');
  }
  createLogger('MEMORY').info('Mémoire courte initialisée (mémoire longue : pas encore implémentée)');
  createLogger('PLANNER').info('Non disponible (phase 3) — tâches simples uniquement');

  const modules = createModules();
  for (const m of modules) createLogger(m.name.toUpperCase()).info('Ready');

  log.info('READY');
  return { config, versionProfile, modules };
}

module.exports = { boot };
