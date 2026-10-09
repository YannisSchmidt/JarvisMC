'use strict';
/**
 * Module BUILDING — construit des plans : maison simple devant le bot, pont jusqu'à une cible.
 * Le plan est généré par le code (blueprint.js), puis exécuté et vérifié (builder.js).
 */
const { makeHouse, makeBridge } = require('../core/blueprint');
const { buildPlan } = require('../core/builder');
const { formatPosition } = require('./status-format');

const KINDS = ['house', 'bridge'];

function createBuildingModule() {
  return {
    name: 'building',
    attach() {
      return () => {};
    },
    commands: [
      {
        name: 'build',
        aliases: ['construire', 'construis'],
        minRole: 'TRUSTED',
        action: true,
        usage: '!build house | !build bridge <x> <y> <z>',
        description: 'Construit une maison devant le bot ou un pont jusqu\'à une cible',
        async run(ctx, args) {
          const kind = (args[0] || '').toLowerCase();
          if (!KINDS.includes(kind)) return `Usage : !build house  ou  !build bridge <x> <y> <z>  (types : ${KINDS.join(', ')})`;
          const { services } = ctx;
          const mc = ctx.bot;
          const here = mc.entity.position.floored();

          let plan;
          try {
            if (kind === 'house') {
              // Maison posée à 2 blocs devant le bot, sol au niveau du sol sous ses pieds.
              plan = makeHouse({ x: here.x + 2, y: here.y - 1, z: here.z + 2 });
            } else {
              const nums = args.slice(1, 4).map(Number);
              if (nums.length !== 3 || nums.some((n) => !Number.isInteger(n))) {
                return 'Usage : !build bridge <x> <y> <z> (coordonnées entières)';
              }
              plan = makeBridge(here, { x: nums[0], y: nums[1], z: nums[2] }, { deckY: here.y - 1 });
            }
          } catch (err) {
            return `Plan impossible : ${err.message}`;
          }

          const current = services.tasks.describe();
          if (current.active) return `Je suis déjà occupé : ${current.name}. (!cancel pour arrêter)`;

          services.tasks.start(`build ${kind}`, async (signal) => {
            try {
              await buildPlan(services.getBot(), { planner: services.planner, gather: services.gather, signal, log: services.log }, plan);
              services.say(`Construction terminée et vérifiée : ${plan.name} (${plan.blocks.length} blocs).`);
            } catch (err) {
              if (err.message !== 'annulé') services.say(`Construction interrompue : ${err.message}`);
              throw err;
            }
          }).catch(() => {});

          const where = kind === 'house' ? `devant moi (${formatPosition({ x: here.x + 2, y: here.y, z: here.z + 2 })})` : `jusqu'à ${args.slice(1, 4).join(' ')}`;
          return `Je construis ${kind === 'house' ? 'une maison' : 'un pont'} ${where} : ${plan.blocks.length} blocs au total.`;
        },
      },
    ],
  };
}

module.exports = { createBuildingModule };
