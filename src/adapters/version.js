'use strict';
/**
 * Version adapter — the ONLY place where Minecraft version numbers are resolved.
 * The rest of the code asks this module for a profile instead of hardcoding versions.
 */
const mcData = require('minecraft-data');

/** Versions de jeu prises en charge (release uniquement, pas de snapshot/pre/rc). */
function isReleaseVersion(entry) {
  return Boolean(entry) && entry.releaseType !== 'snapshot' && !/-(pre|rc)\d*$/.test(entry.minecraftVersion);
}

function listSupportedVersions() {
  return mcData.versions.pc
    .filter(isReleaseVersion)
    .map((v) => v.minecraftVersion);
}

/**
 * Résout une version demandée (ex: "1.21.11") en profil exploitable.
 * @throws {Error} si la version n'est pas prise en charge (avec suggestions).
 */
function resolveVersion(requested) {
  const wanted = String(requested || '').trim();
  const entry = mcData.versions.pc.find((v) => v.minecraftVersion === wanted);

  if (!isReleaseVersion(entry)) {
    const supported = listSupportedVersions();
    const recent = supported.slice(0, 6).join(', ');
    throw new Error(
      `Version Minecraft "${wanted}" non prise en charge. ` +
        `Versions récentes disponibles : ${recent}`
    );
  }

  return {
    minecraftVersion: entry.minecraftVersion,
    protocolVersion: entry.version,
    dataVersion: entry.dataVersion,
    family: entry.majorVersion,
  };
}

module.exports = { resolveVersion, listSupportedVersions, isReleaseVersion };
