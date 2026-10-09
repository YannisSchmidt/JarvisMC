'use strict';
/**
 * Mémoire longue persistante (fichier JSON).
 *  - joueurs connus, lieux importants (base, villages…)
 *  - mémoire procédurale : pour une tâche, quelles stratégies ont marché,
 *    en combien de temps, avec quel rendement.
 *  - erreurs rencontrées et leurs solutions
 *
 * Écriture atomique (fichier temporaire + renommage) pour ne pas corrompre la mémoire.
 */
const fs = require('fs');
const path = require('path');

const MAX_RUNS_PER_TASK = 200;
const MAX_ERRORS = 200;

function emptyState() {
  return { version: 1, players: {}, locations: {}, strategies: {}, errors: [] };
}

class MemoryStore {
  /** @param {string|null} file  chemin du JSON ; null = mémoire volatile (tests) */
  constructor(file = null) {
    this.file = file ? path.resolve(file) : null;
    this.state = this._load();
  }

  _load() {
    if (!this.file || !fs.existsSync(this.file)) return emptyState();
    try {
      return { ...emptyState(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      // Fichier illisible : on le met de côté au lieu de l'écraser silencieusement.
      fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
      return emptyState();
    }
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  /** Enregistre la présence d'un joueur. */
  seePlayer(name, now = Date.now()) {
    const p = this.state.players[name] || { firstSeen: now, timesSeen: 0 };
    p.lastSeen = now;
    p.timesSeen += 1;
    this.state.players[name] = p;
  }

  setLocation(name, pos, extra = {}) {
    this.state.locations[name] = { x: pos.x, y: pos.y, z: pos.z, ...extra, savedAt: Date.now() };
  }

  getLocation(name) {
    return this.state.locations[name] || null;
  }

  /**
   * Enregistre le résultat d'une exécution de stratégie.
   * @param {string} task      ex. "collect:diamond"
   * @param {object} run       { strategy, success, durationMs, actions, yield }
   */
  recordRun(task, run) {
    const list = this.state.strategies[task] || [];
    list.push({ ...run, at: Date.now() });
    if (list.length > MAX_RUNS_PER_TASK) list.splice(0, list.length - MAX_RUNS_PER_TASK);
    this.state.strategies[task] = list;
  }

  /**
   * Meilleure stratégie connue pour une tâche : taux de réussite puis rendement/minute.
   * @returns {object|null}
   */
  bestStrategy(task) {
    const runs = this.state.strategies[task] || [];
    const byStrategy = new Map();
    for (const r of runs) {
      const key = JSON.stringify(r.strategy);
      const s = byStrategy.get(key) || { strategy: r.strategy, runs: 0, successes: 0, minutes: 0, yield: 0 };
      s.runs += 1;
      if (r.success) s.successes += 1;
      s.minutes += (r.durationMs || 0) / 60000;
      s.yield += r.yield || 0;
      byStrategy.set(key, s);
    }
    const scored = [...byStrategy.values()].map((s) => ({
      ...s,
      successRate: s.successes / s.runs,
      perMinute: s.minutes > 0 ? s.yield / s.minutes : 0,
    }));
    scored.sort((a, b) => b.successRate - a.successRate || b.perMinute - a.perMinute);
    return scored[0] || null;
  }

  recordError(context, message, solution = null) {
    this.state.errors.push({ context, message, solution, at: Date.now() });
    if (this.state.errors.length > MAX_ERRORS) this.state.errors.splice(0, this.state.errors.length - MAX_ERRORS);
  }

  summary() {
    return {
      players: Object.keys(this.state.players).length,
      locations: Object.keys(this.state.locations).length,
      tasksLearned: Object.keys(this.state.strategies).length,
      errors: this.state.errors.length,
    };
  }
}

module.exports = { MemoryStore };
