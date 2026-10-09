'use strict';
/**
 * Module INVENTORY — lecture de l'inventaire (résumé par item).
 */

/**
 * Agrège une liste d'items Mineflayer en { nom: quantité }, trié par quantité décroissante.
 * Fonction pure, testable sans serveur.
 */
function summarizeItems(items) {
  const totals = new Map();
  for (const item of items || []) {
    if (!item || !item.name) continue;
    totals.set(item.name, (totals.get(item.name) || 0) + (item.count || 0));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function createInventoryModule() {
  return {
    name: 'inventory',
    attach() {
      return () => {};
    },
    commands: [
      {
        name: 'inventory',
        aliases: ['inv', 'inventaire'],
        minRole: 'PLAYER',
        usage: '!inventory',
        description: 'Résumé de l\'inventaire',
        async run(ctx) {
          const mc = ctx.bot;
          if (!mc || !mc.inventory) return 'Inventaire indisponible.';
          const summary = summarizeItems(mc.inventory.items());
          if (summary.length === 0) return 'Mon inventaire est vide.';
          ctx.services.log.info(`Inventaire : ${summary.map((s) => `${s.name} x${s.count}`).join(', ')}`);
          const top = summary.slice(0, 8).map((s) => `${s.name} x${s.count}`).join(', ');
          const more = summary.length > 8 ? ` (+${summary.length - 8} autres)` : '';
          return `Inventaire : ${top}${more}`;
        },
      },
    ],
  };
}

module.exports = { createInventoryModule, summarizeItems };
