'use strict';
/**
 * Délai de reconnexion : exponentiel, borné. attempt commence à 1.
 * Pure function → testable.
 */
function reconnectDelay(attempt, baseMs, maxMs) {
  const n = Math.max(1, Math.floor(attempt));
  const delay = baseMs * Math.pow(2, n - 1);
  return Math.min(delay, maxMs);
}

module.exports = { reconnectDelay };
