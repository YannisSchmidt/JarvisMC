'use strict';
/**
 * Minecraft adapter — isole la bibliothèque de protocole (Mineflayer) du reste du code.
 * Si un jour Mineflayer est remplacé, seul ce fichier doit changer.
 */
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');

/**
 * Crée une instance Mineflayer à partir de la section `bot` de la config
 * et du profil de version résolu par l'adaptateur de version.
 */
function createMinecraftBot({ bot: botCfg, behavior }, versionProfile) {
  return mineflayer.createBot({
    host: botCfg.host,
    port: botCfg.port,
    username: botCfg.username,
    version: versionProfile.minecraftVersion,
    auth: botCfg.auth,
    respawn: behavior.autoRespawn,
    hideErrors: false,
    checkTimeoutInterval: 30 * 1000,
  });
}

/** Active le pathfinder sur une instance (à appeler après le spawn). */
function attachPathfinder(mc) {
  if (!mc.pathfinder) mc.loadPlugin(pathfinder);
  mc.pathfinder.setMovements(new Movements(mc));
  return mc.pathfinder;
}

module.exports = { createMinecraftBot, attachPathfinder };
