'use strict';
/**
 * Module CRAFTING — fabrication de n'importe quel item via le planificateur,
 * et armures complètes (craft + équipement).
 */
const { craftItem, equipBestArmor, inventoryCounts } = require('../core/crafter');
const { createLogger } = require('../core/logger');

const ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'];
const ARMOR_MATERIALS = ['leather', 'chainmail', 'golden', 'iron', 'diamond', 'netherite'];

function opsFor(services, signal) {
  return { log: createLogger('CRAFT'), signal, gather: services.gather, planner: services.planner };
}

function createCraftingModule() {
  return {
    name: 'crafting',
    attach() {
      return () => {};
    },
    commands: [
      {
        name: 'craft',
        aliases: ['fabrique', 'fabriquer'],
        minRole: 'TRUSTED',
        action: true,
        usage: '!craft <item> [quantité]',
        description: 'Fabrique un item (récolte et fonte incluses si nécessaire)',
        async run(ctx, args) {
          const [item, rawCount] = args;
          const { services } = ctx;
          if (!item) return 'Usage : !craft <item> [quantité]  (ex : !craft diamond_pickaxe 1)';
          const count = Number(rawCount || 1);
          if (!Number.isInteger(count) || count < 1 || count > 64) return 'Quantité invalide (1 à 64).';
          if (!services.data.itemsByName[item]) return `Item inconnu : ${item}`;

          const plan = services.planner.planCraft(item, count, inventoryCounts(ctx.bot));
          if (!plan.ok) return `Impossible : ${plan.reason}`;

          const current = services.tasks.describe();
          if (current.active) return `Je suis déjà occupé : ${current.name}. (!cancel pour arrêter)`;

          services.tasks.start(`craft ${item} ${count}`, async (signal) => {
            try {
              await craftItem(services.getBot(), services.planner, item, count, opsFor(services, signal));
              services.say(`Fabriqué : ${count} × ${item}.`);
            } catch (err) {
              if (err.message !== 'annulé') services.say(`Échec du craft de ${item} : ${err.message}`);
              throw err;
            }
          }).catch(() => {});
          return `Je fabrique ${count} × ${item}. (étapes prévues : ${plan.steps.length}, à récolter : ${Object.keys(plan.leaves).join(', ') || 'rien'})`;
        },
      },
      {
        name: 'armor',
        aliases: ['armure'],
        minRole: 'TRUSTED',
        action: true,
        usage: '!armor <leather|chainmail|golden|iron|diamond|netherite>',
        description: 'Fabrique une armure complète et l\'équipe',
        async run(ctx, args) {
          const material = (args[0] || '').toLowerCase();
          if (!ARMOR_MATERIALS.includes(material)) return `Matière inconnue. Choix : ${ARMOR_MATERIALS.join(', ')}`;
          const { services } = ctx;
          const current = services.tasks.describe();
          if (current.active) return `Je suis déjà occupé : ${current.name}. (!cancel pour arrêter)`;

          services.tasks.start(`armor ${material}`, async (signal) => {
            const mc = services.getBot();
            try {
              for (const piece of ARMOR_PIECES) {
                await craftItem(mc, services.planner, `${material}_${piece}`, 1, opsFor(services, signal));
              }
              const equipped = await equipBestArmor(mc);
              services.say(`Armure ${material} complète, équipée : ${equipped.join(', ')}.`);
            } catch (err) {
              if (err.message !== 'annulé') services.say(`Échec de l'armure ${material} : ${err.message}`);
              throw err;
            }
          }).catch(() => {});
          return `Je fabrique l'armure ${material} complète.`;
        },
      },
    ],
  };
}

module.exports = { createCraftingModule };
