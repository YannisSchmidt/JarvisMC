'use strict';
/**
 * Commandes directes (préfixe "!") séparées du langage naturel.
 * Les modules enregistrent leurs commandes ici ; le parseur est pur et testable.
 */
const { hasRank } = require('./permissions');

const PREFIX = '!';

/**
 * Découpe un message "!goto 10 64 -20" → { name: 'goto', args: ['10','64','-20'] }.
 * Retourne null si le message n'est pas une commande.
 */
function parseCommand(message) {
  if (typeof message !== 'string') return null;
  const text = message.trim();
  if (!text.startsWith(PREFIX)) return null;
  const parts = text.slice(PREFIX.length).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return { name: parts[0].toLowerCase(), args: parts.slice(1) };
}

class CommandRegistry {
  constructor() {
    this.commands = new Map();
  }

  /**
   * @param {{name:string, aliases?:string[], minRole?:string, description?:string,
   *          usage?:string, action?:boolean (refusée pendant une pause), needsBot?:boolean (défaut true), run:(ctx:object, args:string[])=>Promise<string|void>|string|void}} def
   */
  register(def) {
    if (!def || !def.name || typeof def.run !== 'function') {
      throw new Error('Commande invalide : name et run sont requis');
    }
    const entry = { minRole: 'PLAYER', aliases: [], description: '', usage: '', action: false, needsBot: true, ...def };
    for (const key of [entry.name, ...entry.aliases]) {
      if (this.commands.has(key)) throw new Error(`Commande déjà enregistrée : ${key}`);
      this.commands.set(key, entry);
    }
  }

  list() {
    const unique = new Set(this.commands.values());
    return [...unique];
  }

  /**
   * Exécute un message si c'est une commande.
   * @returns {Promise<{handled:boolean, reply?:string}>}
   */
  async execute(message, ctx) {
    const parsed = parseCommand(message);
    if (!parsed) return { handled: false };
    const def = this.commands.get(parsed.name);
    if (!def) return { handled: true, reply: `Commande inconnue : !${parsed.name} (essayez !help)` };
    if (!hasRank(ctx.role, def.minRole)) {
      return { handled: true, reply: `Désolé, cette commande est réservée (${def.minRole}).` };
    }
    if (def.needsBot && !ctx.connected) {
      return { handled: true, reply: 'Je ne suis pas connecté au serveur, impossible pour le moment.' };
    }
    if (ctx.paused && def.action) {
      return { handled: true, reply: 'Je suis en pause (!resume pour reprendre).' };
    }
    try {
      const reply = await def.run(ctx, parsed.args);
      return { handled: true, reply: reply || undefined };
    } catch (err) {
      return { handled: true, reply: `Échec : ${err.message}` };
    }
  }
}

module.exports = { CommandRegistry, parseCommand, PREFIX };
