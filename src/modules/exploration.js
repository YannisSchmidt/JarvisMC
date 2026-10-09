'use strict';
/**
 * Module EXPLORATION — base du joueur, recherche de blocs dans les chunks chargés,
 * exploration par points de passage. Les lieux importants sont mémorisés.
 */
const { goals: { GoalNear } } = require('mineflayer-pathfinder');
const { formatPosition } = require('./status-format');

const MAX_WAYPOINTS = 10;
const WAYPOINT_DISTANCE = 40;

/** Parcourt des points aléatoires autour du bot ; s'arrête si annulé. */
async function explore(mc, waypoints, signal) {
  const here = mc.entity.position;
  let reached = 0;
  for (let i = 0; i < waypoints; i += 1) {
    if (signal.aborted) throw new Error('annulé');
    const a = Math.random() * Math.PI * 2;
    const x = Math.floor(here.x + Math.cos(a) * WAYPOINT_DISTANCE);
    const z = Math.floor(here.z + Math.sin(a) * WAYPOINT_DISTANCE);
    try {
      await mc.pathfinder.goto(new GoalNear(x, mc.entity.position.y, z, 4));
      reached += 1;
    } catch {
      /* point inatteignable : on passe au suivant */
    }
  }
  return reached;
}

function createExplorationModule() {
  return {
    name: 'exploration',
    attach() {
      return () => {};
    },
    commands: [
      {
        name: 'setbase',
        aliases: ['base-ici'],
        minRole: 'TRUSTED',
        usage: '!setbase',
        description: 'Mémorise la position actuelle comme base',
        run(ctx) {
          const { memory, gate } = ctx.services;
          const pos = ctx.bot.entity.position.floored();
          const existing = memory.getLocation('base');
          const save = () => {
            memory.setLocation('base', pos, { dimension: ctx.bot.game && ctx.bot.game.dimension });
            memory.save();
            return `Base enregistrée en ${formatPosition(pos)}.`;
          };
          if (existing && gate) {
            gate.request(ctx.username, `remplacer la base (${formatPosition(existing)})`, save);
            return `Une base existe déjà en ${formatPosition(existing)}. Tapez !confirm pour la remplacer.`;
          }
          return save();
        },
      },
      {
        name: 'base',
        aliases: ['maison'],
        minRole: 'TRUSTED',
        action: true,
        usage: '!base',
        description: 'Rentre à la base mémorisée',
        run(ctx) {
          const base = ctx.services.memory.getLocation('base');
          if (!base) return 'Aucune base enregistrée. Utilisez !setbase.';
          const { tasks, say, log } = ctx.services;
          if (tasks.describe().active) return `Je suis déjà occupé : ${tasks.describe().name}.`;
          tasks.start('base', async (signal) => {
            const mc = ctx.services.getBot();
            await mc.pathfinder.goto(new GoalNear(base.x, base.y, base.z, 2));
            if (signal.aborted) throw new Error('annulé');
            say('Je suis à la base.');
          }).catch((err) => log.warn(`base : ${err.message}`));
          return `Je rentre à la base (${formatPosition(base)}).`;
        },
      },
      {
        name: 'find',
        aliases: ['trouve', 'chercher'],
        minRole: 'PLAYER',
        usage: '!find <bloc>',
        description: 'Cherche un bloc dans les chunks chargés',
        run(ctx, args) {
          const name = (args[0] || '').toLowerCase();
          if (!name) return 'Usage : !find <nom_du_bloc>  (ex : !find diamond_ore)';
          const mc = ctx.bot;
          const found = mc.findBlock({ matching: (b) => b && b.name === name, maxDistance: 128 });
          if (!found) return `Pas de ${name} dans les zones chargées autour de moi.`;
          return `${name} trouvé en ${formatPosition(found.position)}.`;
        },
      },
      {
        name: 'explore',
        aliases: ['explorer'],
        minRole: 'TRUSTED',
        action: true,
        usage: '!explore [points]',
        description: 'Explore la zone par points de passage',
        run(ctx, args) {
          const n = Math.min(MAX_WAYPOINTS, Math.max(1, Number(args[0] || 3)));
          if (!Number.isInteger(n)) return 'Usage : !explore [nombre de points (1-10)]';
          const { tasks, say, log } = ctx.services;
          if (tasks.describe().active) return `Je suis déjà occupé : ${tasks.describe().name}.`;
          tasks.start(`explore ${n}`, async (signal) => {
            const mc = ctx.services.getBot();
            const reached = await explore(mc, n, signal);
            say(`Exploration terminée : ${reached}/${n} points atteints. Position ${formatPosition(mc.entity.position)}.`);
          }).catch((err) => log.warn(`explore : ${err.message}`));
          return `J'explore ${n} points de passage.`;
        },
      },
    ],
  };
}

module.exports = { createExplorationModule };
