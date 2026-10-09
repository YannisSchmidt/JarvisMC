'use strict';
/**
 * Gestionnaire de tâches : une tâche active à la fois, annulable via AbortSignal.
 * Une tâche n'est "done" que si son exécuteur renvoie sans erreur (la vérification
 * des résultats est faite dans la tâche elle-même).
 */
let nextId = 1;

class TaskManager {
  /** @param {{log?: {info:Function, warn:Function}, onChange?: Function}} opts */
  constructor({ log = null, onChange = () => {} } = {}) {
    this.log = log;
    this.onChange = onChange;
    this.current = null;
    this.history = [];
  }

  /**
   * Lance une tâche. `fn(signal)` doit respecter `signal.aborted`.
   * @returns {Promise<object>} la tâche terminée
   * @throws si une tâche est déjà en cours
   */
  async start(name, fn) {
    if (this.current) throw new Error(`une tâche est déjà en cours : "${this.current.name}"`);
    const controller = new AbortController();
    const task = {
      id: nextId++,
      name,
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      error: null,
      controller,
    };
    this.current = task;
    this._notify();
    if (this.log) this.log.info(`Tâche démarrée : ${name}`);
    try {
      await fn(controller.signal);
      task.status = controller.signal.aborted ? 'cancelled' : 'done';
    } catch (err) {
      task.status = controller.signal.aborted ? 'cancelled' : 'failed';
      task.error = err.message;
    } finally {
      task.endedAt = Date.now();
      this.current = null;
      this.history.push(this._snapshot(task));
      if (this.history.length > 50) this.history.shift();
      this._notify();
      if (this.log) {
        if (task.status === 'done') this.log.info(`Tâche terminée : ${name}`);
        else if (task.status === 'cancelled') this.log.info(`Tâche annulée : ${name}`);
        else this.log.warn(`Tâche échouée : ${name} — ${task.error}`);
      }
    }
    return this._snapshot(task);
  }

  /** Annule la tâche courante. @returns {boolean} true si une tâche était active. */
  cancel(reason = 'annulée par l\'utilisateur') {
    if (!this.current) return false;
    this.current.controller.abort(new Error(reason));
    return true;
  }

  describe() {
    if (!this.current) return { active: false };
    const { id, name, status, startedAt } = this.current;
    return { active: true, id, name, status, startedAt };
  }

  _snapshot(task) {
    const { controller, ...rest } = task;
    return rest;
  }

  _notify() {
    try {
      this.onChange(this.describe());
    } catch (_) {
      /* les observateurs ne doivent jamais casser le gestionnaire */
    }
  }
}

module.exports = { TaskManager };
