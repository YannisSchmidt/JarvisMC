'use strict';
/**
 * Système de permissions.
 * Rôles : HOSTILE < UNKNOWN < PLAYER < TRUSTED < OWNER (CONSOLE = OWNER).
 */
const ROLES = Object.freeze({
  HOSTILE: 'HOSTILE',
  UNKNOWN: 'UNKNOWN',
  PLAYER: 'PLAYER',
  TRUSTED: 'TRUSTED',
  OWNER: 'OWNER',
  CONSOLE: 'CONSOLE',
});

const RANK = { HOSTILE: 0, UNKNOWN: 1, PLAYER: 2, TRUSTED: 3, OWNER: 4, CONSOLE: 4 };

/**
 * Détermine le rôle d'un joueur à partir de la configuration.
 * @param {string|null} username
 * @param {{owner?:string, trusted?:string[], blocked?:string[]}} behavior
 */
function roleOf(username, behavior = {}) {
  if (!username) return ROLES.UNKNOWN;
  const name = username.toLowerCase();
  const eq = (other) => typeof other === 'string' && other.toLowerCase() === name;
  if (eq(behavior.owner)) return ROLES.OWNER;
  if ((behavior.blocked || []).some(eq)) return ROLES.HOSTILE;
  if ((behavior.trusted || []).some(eq)) return ROLES.TRUSTED;
  return ROLES.PLAYER;
}

/** Vrai si `role` atteint au moins `minRole`. */
function hasRank(role, minRole) {
  if (RANK[role] === undefined) return false;
  return RANK[role] >= RANK[minRole];
}

module.exports = { ROLES, roleOf, hasRank };
