'use strict';
/**
 * Module GENERAL — aide, statut, tâches, arrêt/reprise, reconnexion, arrêt du programme.
 */
const { formatPosition } = require('./status-format');
const { hasRank } = require('../core/permissions');

function createGeneralModule() {
  return {
    name: 'general',
    attach() {
      return () => {};
    },
    commands: [
      {
        name: 'help',
        needsBot: false,
        aliases: ['aide'],
        minRole: 'PLAYER',
        usage: '!help',
        description: 'Liste des commandes',
        run(ctx) {
          const names = ctx.services.commands
            .list()
            .filter((c) => hasRank(ctx.role, c.minRole))
            .map((c) => `!${c.name}`)
            .sort();
          return `Commandes disponibles pour vous : ${names.join(' ')}`;
        },
      },
      {
        name: 'status',
        needsBot: false,
        aliases: ['statut'],
        minRole: 'PLAYER',
        usage: '!status',
        description: 'État du bot',
        run(ctx) {
          const mc = ctx.bot;
          const task = ctx.services.tasks.describe();
          const online = ctx.connected && mc;
          const parts = [
            online ? `Pos ${formatPosition(mc.entity && mc.entity.position)}` : 'Hors ligne',
            online ? `PV ${Math.round(mc.health || 0)}/20` : null,
            online ? `Faim ${mc.food || 0}/20` : null,
            `Tâche : ${task.active ? task.name : 'aucune'}`,
            ctx.services.isPaused() ? 'EN PAUSE' : null,
            `IA : ${ctx.services.config.ai.enabled ? 'activée (non implémentée)' : 'désactivée'}`,
          ].filter(Boolean);
          return parts.join(' | ');
        },
      },
      {
        name: 'task',
        needsBot: false,
        aliases: ['tache', 'tâche'],
        minRole: 'PLAYER',
        usage: '!task',
        description: 'Tâche en cours',
        run(ctx) {
          const task = ctx.services.tasks.describe();
          return task.active ? `Tâche en cours : ${task.name} (${task.status})` : 'Aucune tâche en cours.';
        },
      },
      {
        name: 'cancel',
        needsBot: false,
        aliases: ['annuler'],
        minRole: 'TRUSTED',
        action: false,
        usage: '!cancel',
        description: 'Annule la tâche en cours',
        run(ctx) {
          return ctx.services.tasks.cancel('annulée par ' + ctx.username) ? 'Tâche annulée.' : 'Rien à annuler.';
        },
      },
      {
        name: 'stop',
        needsBot: false,
        aliases: ['arret', 'arrêt'],
        minRole: 'TRUSTED',
        usage: '!stop',
        description: 'Arrête tout et se met en pause',
        run(ctx) {
          ctx.services.setPaused(true);
          ctx.services.stopAll();
          return 'Arrêt. Je suis en pause jusqu\'à !resume.';
        },
      },
      {
        name: 'resume',
        needsBot: false,
        aliases: ['reprendre'],
        minRole: 'TRUSTED',
        usage: '!resume',
        description: 'Reprend après !stop',
        run(ctx) {
          ctx.services.setPaused(false);
          return 'Je reprends.';
        },
      },
      {
        name: 'reconnect',
        needsBot: false,
        aliases: ['reconnecter'],
        minRole: 'OWNER',
        usage: '!reconnect',
        description: 'Reconnexion au serveur',
        run(ctx) {
          setImmediate(() => ctx.jarvis.reconnect());
          return 'Je me reconnecte.';
        },
      },
      {
        name: 'confirm',
        aliases: ['confirmer', 'oui'],
        minRole: 'TRUSTED',
        needsBot: false,
        usage: '!confirm',
        description: 'Confirme la dernière action dangereuse demandée',
        run(ctx) {
          const pending = ctx.services.gate.take(ctx.username);
          if (!pending) return 'Rien à confirmer (ou la demande a expiré).';
          return pending.action();
        },
      },
      {
        name: 'memory',
        aliases: ['memoire', 'mémoire'],
        minRole: 'OWNER',
        needsBot: false,
        usage: '!memory',
        description: 'Résumé de la mémoire et des stratégies apprises',
        run(ctx) {
          const { memory } = ctx.services;
          const s = memory.summary();
          const best = memory.bestStrategy('collect:diamond');
          const base = memory.getLocation('base');
          const parts = [
            `${s.players} joueurs`,
            `${s.locations} lieux`,
            `${s.tasksLearned} tâches apprises`,
            base ? `base ${formatPosition(base)}` : 'pas de base',
          ];
          if (best) parts.push(`diamant : ${Math.round(best.successRate * 100)}% réussite sur ${best.runs} essais`);
          return `Mémoire : ${parts.join(' | ')}`;
        },
      },
      {
        name: 'quit',
        needsBot: false,
        aliases: ['quitter'],
        minRole: 'OWNER',
        usage: '!quit',
        description: 'Quitte le serveur et arrête JarvisMC',
        run(ctx) {
          setImmediate(() => ctx.services.requestShutdown());
          return 'Au revoir !';
        },
      },
    ],
  };
}

module.exports = { createGeneralModule };
