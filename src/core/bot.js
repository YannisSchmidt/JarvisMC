'use strict';
/**
 * JarvisBot — cœur du bot : cycle de vie de la connexion, reconnexion,
 * routage des messages (commandes / langage naturel) et permissions.
 */
const { EventEmitter } = require('events');
const { createMinecraftBot } = require('../adapters/minecraft');
const { reconnectDelay } = require('./backoff');
const { roleOf, ROLES, hasRank } = require('./permissions');
const { TaskManager } = require('./tasks');
const { CommandRegistry } = require('./commands');
const { createLogger } = require('./logger');

const MAX_CHAT_LENGTH = 200;

/** Découpe un texte en morceaux compatibles avec le chat Minecraft. */
function splitForChat(text, max = MAX_CHAT_LENGTH) {
  const chunks = [];
  let rest = String(text);
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length) chunks.push(rest);
  return chunks;
}

class JarvisBot extends EventEmitter {
  /**
   * @param {object} deps
   * @param {object} deps.config       configuration normalisée
   * @param {object} deps.versionProfile profil de version (adapter/version)
   * @param {Array}  deps.modules      modules { name, attach(mc, svc)=>cleanup, commands:[] }
   * @param {Function} [deps.createBot] fabrique (pour les tests)
   */
  constructor({ config, versionProfile, modules = [], createBot = createMinecraftBot }) {
    super();
    this.config = config;
    this.versionProfile = versionProfile;
    this.modules = modules;
    this.createBot = createBot;
    this.log = createLogger('BOT');
    this.commands = new CommandRegistry();
    this.tasks = new TaskManager({ log: createLogger('TASK') });
    this.mc = null;
    this.connected = false;
    this.stopping = false;
    this.paused = false;
    this.attempt = 0;
    this.reconnectTimer = null;
    this.moduleCleanups = [];
    this.lastReply = 0;
    this.services = this._buildServices();

    for (const mod of modules) {
      for (const def of mod.commands || []) this.commands.register(def);
    }
  }

  /** Services partagés, passés aux modules et aux commandes. */
  _buildServices() {
    return {
      config: this.config,
      versionProfile: this.versionProfile,
      tasks: this.tasks,
      commands: this.commands,
      log: createLogger('CORE'),
      say: (text) => this.say(text),
      getBot: () => this.mc,
      isPaused: () => this.paused,
      setPaused: (v) => {
        this.paused = Boolean(v);
      },
      stopAll: () => this.stopAll(),
      requestShutdown: () => this.emit('shutdown-requested'),
    };
  }

  /** Démarre la connexion (et la reconnexion automatique si activée). */
  start() {
    this.stopping = false;
    this.connect();
  }

  /** Arrête le bot proprement : pas de reconnexion, annulation des tâches. */
  stop(reason = 'arrêt demandé') {
    this.stopping = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopAll();
    if (this.mc) {
      try {
        this.mc.quit(reason);
      } catch (_) {
        /* déjà déconnecté */
      }
    }
  }

  /** Annule la tâche en cours et les déplacements, sans quitter le serveur. */
  stopAll() {
    const cancelled = this.tasks.cancel('arrêt demandé');
    const mc = this.mc;
    if (mc) {
      if (mc.pathfinder) mc.pathfinder.setGoal(null);
      if (mc.clearControlStates) mc.clearControlStates();
    }
    return cancelled;
  }

  /** Reconnecte immédiatement (ferme la session courante si besoin). */
  reconnect() {
    this.log.info('Reconnexion demandée');
    this.attempt = 0;
    this.stopping = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.mc) {
      this.mc.removeAllListeners('end');
      try {
        this.mc.quit('reconnexion');
      } catch (_) {
        /* ignore */
      }
      this._cleanupModules();
      this.mc = null;
    }
    this.connect();
  }

  connect() {
    const { bot: botCfg } = this.config;
    this.log.info(`Connexion à ${botCfg.host}:${botCfg.port} (Minecraft ${this.versionProfile.minecraftVersion}, ${botCfg.auth})...`);
    let mc;
    try {
      mc = this.createBot(this.config, this.versionProfile);
    } catch (err) {
      this.log.error(`Impossible de créer le bot : ${err.message}`);
      this._scheduleReconnect();
      return;
    }
    this.mc = mc;
    this.connected = false;

    mc.once('spawn', () => this._onSpawn(mc));
    mc.on('chat', (username, message) => this._onMessage(username, message));
    mc.on('whisper', (username, message) => this._onMessage(username, message));
    mc.on('kicked', (reason) => this.log.warn(`Expulsé du serveur : ${formatReason(reason)}`));
    mc.on('error', (err) => this.log.error(`Erreur de connexion : ${err.message}`));
    mc.once('end', (reason) => this._onEnd(mc, reason));
  }

  _onSpawn(mc) {
    if (mc !== this.mc) return;
    this.connected = true;
    this.attempt = 0;
    this.log.info('Connecté et spawné dans le monde.');
    for (const mod of this.modules) {
      try {
        const cleanup = mod.attach ? mod.attach(mc, this.services) : null;
        if (typeof cleanup === 'function') this.moduleCleanups.push(cleanup);
      } catch (err) {
        this.log.error(`Module "${mod.name}" en échec au spawn : ${err.message}`);
      }
    }
    this.emit('ready');
  }

  _onEnd(mc, reason) {
    if (mc !== this.mc) return;
    this.connected = false;
    this.log.warn(`Déconnecté${reason ? ` : ${reason}` : ''}`);
    this._cleanupModules();
    this.mc = null;
    this.emit('disconnected', reason);
    if (!this.stopping && this.config.behavior.autoReconnect) this._scheduleReconnect();
  }

  _cleanupModules() {
    for (const cleanup of this.moduleCleanups.splice(0)) {
      try {
        cleanup();
      } catch (_) {
        /* un module ne doit pas bloquer la reconnexion */
      }
    }
  }

  _scheduleReconnect() {
    if (this.stopping) return;
    this.attempt += 1;
    const { reconnectBaseDelayMs, reconnectMaxDelayMs } = this.config.behavior;
    const delay = reconnectDelay(this.attempt, reconnectBaseDelayMs, reconnectMaxDelayMs);
    const human = delay < 1000 ? `${delay} ms` : `${Math.round(delay / 1000)} s`;
    this.log.info(`Nouvelle tentative (#${this.attempt}) dans ${human}`);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Envoie un message dans le chat (découpé si trop long). */
  say(text) {
    if (!this.mc || !this.connected) {
      this.log.warn(`Message non envoyé (hors ligne) : ${text}`);
      return;
    }
    for (const chunk of splitForChat(text)) {
      this.mc.chat(chunk);
      this.log.action(`chat → ${chunk}`);
    }
  }

  /**
   * Routage d'un message reçu (chat public ou whisper).
   * Les commandes "!" sont traitées ici ; le langage naturel est délégué à l'IA
   * (non implémentée pour l'instant → message honnête, pas de fausse exécution).
   */
  async _onMessage(username, message) {
    if (!this.mc || username === this.mc.username) return;
    const role = roleOf(username, this.config.behavior);
    if (role === ROLES.HOSTILE) {
      this.log.debug(`Message ignoré d'un joueur bloqué : ${username}`);
      return;
    }
    this.log.info(`[${role}] ${username}: ${message}`);
    const ctx = { username, role, bot: this.mc, connected: this.connected, jarvis: this, services: this.services, paused: this.paused };
    const result = await this.commands.execute(message, ctx);
    if (result.handled) {
      if (result.reply) this.say(result.reply);
      return;
    }
    // Message en langage naturel : seul le propriétaire (ou un joueur de confiance) reçoit une réponse.
    if (hasRank(role, ROLES.TRUSTED)) {
      this.say(`Je ne comprends pas encore le langage naturel (IA : ${this.config.ai.enabled ? 'pas encore implémentée' : 'désactivée'}). Essayez !help.`);
    }
  }
}

function formatReason(reason) {
  if (!reason) return 'raison inconnue';
  if (typeof reason === 'string') {
    try {
      const parsed = JSON.parse(reason);
      return parsed.text || parsed.translate || reason;
    } catch (_) {
      return reason;
    }
  }
  return JSON.stringify(reason);
}

module.exports = { JarvisBot, splitForChat, formatReason };
