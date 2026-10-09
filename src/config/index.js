'use strict';
/**
 * Chargement et validation de config.json (unique fichier de configuration).
 * Les valeurs absentes prennent les défauts ci-dessous. Aucune modification du code requise.
 */
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  bot: { username: 'BestFriendBot', host: 'localhost', port: 25565, version: '1.21.11', auth: 'offline' },
  behavior: {
    owner: null,
    trusted: [],
    blocked: [],
    autoReconnect: true,
    reconnectBaseDelayMs: 2000,
    reconnectMaxDelayMs: 60000,
    autoEat: true,
    autoSleep: true,
    autoRespawn: true,
    lowHealthAlert: 6,
  },
  ai: { enabled: false, provider: 'local', model: null },
  logging: { level: 'INFO', file: 'logs/jarvismc.log' },
};

const PLACEHOLDERS = new Set(['PLAYER_NAME', 'MODEL_NAME', '']);
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const AUTH_MODES = ['offline', 'microsoft'];
const AI_PROVIDERS = ['local', 'none'];
const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

class ConfigError extends Error {
  constructor(problems) {
    super(`Configuration invalide :\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

/** Valide une configuration fusionnée. Retourne la liste des problèmes (vide si OK). */
function validate(cfg) {
  const problems = [];
  const { bot, behavior, ai, logging } = cfg;

  if (typeof bot.username !== 'string' || !USERNAME_RE.test(bot.username)) {
    problems.push('bot.username doit faire 3 à 16 caractères alphanumériques ou "_"');
  }
  if (typeof bot.host !== 'string' || bot.host.trim() === '') problems.push('bot.host est requis');
  if (!Number.isInteger(bot.port) || bot.port < 1 || bot.port > 65535) {
    problems.push('bot.port doit être un entier entre 1 et 65535');
  }
  if (typeof bot.version !== 'string' || bot.version.trim() === '') problems.push('bot.version est requis');
  if (!AUTH_MODES.includes(bot.auth)) problems.push(`bot.auth doit être parmi : ${AUTH_MODES.join(', ')}`);

  for (const key of ['trusted', 'blocked']) {
    if (!Array.isArray(behavior[key]) || behavior[key].some((n) => typeof n !== 'string')) {
      problems.push(`behavior.${key} doit être une liste de pseudos`);
    }
  }
  if (!Number.isInteger(behavior.reconnectBaseDelayMs) || behavior.reconnectBaseDelayMs < 0) {
    problems.push('behavior.reconnectBaseDelayMs doit être un entier positif');
  }
  if (!Number.isInteger(behavior.reconnectMaxDelayMs) || behavior.reconnectMaxDelayMs < behavior.reconnectBaseDelayMs) {
    problems.push('behavior.reconnectMaxDelayMs doit être >= reconnectBaseDelayMs');
  }
  if (typeof behavior.lowHealthAlert !== 'number' || behavior.lowHealthAlert < 0 || behavior.lowHealthAlert > 20) {
    problems.push('behavior.lowHealthAlert doit être un nombre entre 0 et 20');
  }

  if (typeof ai.enabled !== 'boolean') problems.push('ai.enabled doit être true ou false');
  if (!AI_PROVIDERS.includes(ai.provider)) problems.push(`ai.provider doit être parmi : ${AI_PROVIDERS.join(', ')}`);

  if (!LOG_LEVELS.includes(String(logging.level).toUpperCase())) {
    problems.push(`logging.level doit être parmi : ${LOG_LEVELS.join(', ')}`);
  }
  return problems;
}

/**
 * Normalise une configuration brute (objet JSON) : fusion avec les défauts,
 * placeholders remplacés par null, validation.
 * @throws {ConfigError}
 */
function normalizeConfig(raw) {
  if (!isPlainObject(raw)) throw new ConfigError(['le fichier doit contenir un objet JSON']);
  const cfg = deepMerge(DEFAULTS, raw);

  if (PLACEHOLDERS.has(String(cfg.behavior.owner || '').trim())) cfg.behavior.owner = null;
  if (PLACEHOLDERS.has(String(cfg.ai.model || '').trim())) cfg.ai.model = null;

  const problems = validate(cfg);
  if (problems.length) throw new ConfigError(problems);
  return cfg;
}

/**
 * Charge config.json depuis `filePath` (défaut : ./config.json).
 * @throws {ConfigError|Error}
 */
function loadConfig(filePath = path.resolve(process.cwd(), 'config.json')) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Fichier de configuration introuvable : ${filePath}\n` +
        'Copiez config.example.json vers config.json puis adaptez-le.'
    );
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`JSON invalide dans ${filePath} : ${err.message}`);
  }
  return normalizeConfig(raw);
}

module.exports = { loadConfig, normalizeConfig, validate, deepMerge, DEFAULTS, ConfigError };
