'use strict';
/**
 * Garde de sécurité : les actions dangereuses ou irréversibles demandent une
 * confirmation explicite (!confirm) dans un délai court.
 *
 * Niveaux : SAFE, NORMAL, DANGEROUS, CRITICAL.
 */
const LEVELS = Object.freeze({ SAFE: 'SAFE', NORMAL: 'NORMAL', DANGEROUS: 'DANGEROUS', CRITICAL: 'CRITICAL' });

class ConfirmationGate {
  /** @param {{ttlMs?:number, now?:()=>number}} opts */
  constructor({ ttlMs = 60000, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.pending = new Map(); // username → { label, action, expires }
  }

  /**
   * Mémorise une action à exécuter si le joueur confirme.
   * @param {string} username
   * @param {string} label    description lisible
   * @param {() => string|void} action  renvoie la réponse à envoyer
   */
  request(username, label, action) {
    this.pending.set(username.toLowerCase(), { label, action, expires: this.now() + this.ttlMs });
    return label;
  }

  /** Retire et renvoie l'action en attente (ou null si rien ou expirée). */
  take(username) {
    const key = username.toLowerCase();
    const entry = this.pending.get(key);
    this.pending.delete(key);
    if (!entry || entry.expires < this.now()) return null;
    return entry;
  }
}

module.exports = { ConfirmationGate, LEVELS };
