'use strict';
/**
 * Module MOVEMENT / NAVIGATION — déplacements vers une position, suivi d'un joueur.
 * Niveau "Goal navigation" du plan : pathfinder Mineflayer + vérification d'arrivée.
 */
const { goals: { GoalNear, GoalFollow } } = require('mineflayer-pathfinder');
const { attachPathfinder } = require('../adapters/minecraft');

const ARRIVAL_TOLERANCE = 2.5;

function parseCoords(args) {
  if (args.length !== 3) return null;
  const nums = args.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return { x: nums[0], y: nums[1], z: nums[2] };
}

/** Attend qu'un signal d'annulation soit déclenché. */
function untilAborted(signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener('abort', resolve, { once: true });
  });
}

/** Message de refus si une tâche est déjà en cours (sinon null). */
function busyReply(tasks) {
  const current = tasks.describe();
  return current.active ? `Je suis déjà occupé : ${current.name}. (!cancel pour arrêter)` : null;
}

function createMovementModule() {
  return {
    name: 'movement',

    attach(mc) {
      attachPathfinder(mc);
      return () => {};
    },

    commands: [
      {
        name: 'goto',
        aliases: ['aller'],
        minRole: 'TRUSTED',
        action: true,
        usage: '!goto <x> <y> <z>',
        description: 'Va à une position',
        async run(ctx, args) {
          const target = parseCoords(args);
          if (!target) return 'Usage : !goto <x> <y> <z>';
          const { tasks, log, say } = ctx.services;
          const busy = busyReply(tasks);
          if (busy) return busy;
          const mc = ctx.bot;
          const goal = new GoalNear(target.x, target.y, target.z, 1);
          tasks.start(`goto ${target.x} ${target.y} ${target.z}`, async (signal) => {
            const done = mc.pathfinder.goto(goal);
            const aborted = untilAborted(signal).then(() => {
              mc.pathfinder.setGoal(null);
              throw new Error('annulé');
            });
            await Promise.race([done, aborted]);
            // Vérification réelle : on contrôle la position, on ne suppose pas l'arrivée.
            const pos = mc.entity.position;
            const d = Math.hypot(pos.x - target.x, pos.z - target.z);
            if (d > ARRIVAL_TOLERANCE) throw new Error(`arrêt à ${d.toFixed(1)} blocs de la cible`);
            say(`Arrivé à ${target.x} ${target.y} ${target.z}.`);
          }).catch((err) => log.warn(`goto : ${err.message}`));
          return `Je me mets en route vers ${target.x} ${target.y} ${target.z}.`;
        },
      },
      {
        name: 'follow',
        aliases: ['suis'],
        minRole: 'TRUSTED',
        action: true,
        usage: '!follow <joueur>',
        description: 'Suit un joueur',
        async run(ctx, args) {
          const name = args[0] || ctx.username;
          const mc = ctx.bot;
          const entity = mc.players[name] && mc.players[name].entity;
          if (!entity) return `Je ne vois pas ${name} à proximité.`;
          const { tasks, log } = ctx.services;
          const busy = busyReply(tasks);
          if (busy) return busy;
          tasks.start(`follow ${name}`, async (signal) => {
            mc.pathfinder.setGoal(new GoalFollow(entity, 3), true);
            await untilAborted(signal);
            mc.pathfinder.setGoal(null);
          }).catch((err) => log.warn(`follow : ${err.message}`));
          return `Je suis ${name}.`;
        },
      },
    ],
  };
}

module.exports = { createMovementModule, parseCoords, ARRIVAL_TOLERANCE };
