'use strict';
/**
 * Module GATHERING — récolte de matières (bois, pierre, minerais…).
 *
 * Stratégie :
 *  1. chercher le bloc le plus proche dans les chunks chargés ;
 *  2. sinon descendre à l'altitude préférée du minerai, puis explorer ;
 *  3. s'approcher, choisir (ou fabriquer) le bon outil, miner ;
 *  4. VÉRIFIER que le bloc a disparu et que l'inventaire a progressé ;
 *  5. ramasser les drops, mémoriser le résultat (mémoire procédurale).
 */
const { goals: { GoalNear } } = require('mineflayer-pathfinder');
const { sourceFor, blockMatches, bestOwnedTool, cheapestAllowedTool, RARE_CONFIRM_THRESHOLD } = require('../core/resources');
const { craftItem, countOf, goNear } = require('../core/crafter');
const { createLogger } = require('../core/logger');

const MAX_CONSECUTIVE_FAILS = 4;
const MAX_EXPLORE_TRIPS = 6;
const SEARCH_DISTANCE = 48;
const EXPLORE_STEP = 24;

const pos2key = (p) => `${p.x},${p.y},${p.z}`;

/** Outils (noms d'items) capables de récolter un bloc, selon les données du jeu. */
function allowedToolsFor(data, block) {
  if (!block.harvestTools) return null;
  return new Set(Object.keys(block.harvestTools).map((id) => data.items[id].name));
}

/**
 * Compte les items récoltés pour une source (ex. "log" compte toutes les bûches).
 */
function collectedCount(mc, source) {
  if (source.key === 'log') return countOf(mc, 'log');
  return countOf(mc, source.drop || source.key);
}

/** Ramasse les items au sol proches (drops non ramassés automatiquement). */
async function pickUpNearbyDrops(mc, signal) {
  const here = mc.entity.position;
  const drops = Object.values(mc.entities)
    .filter((e) => e && e.name === 'item' && e.position && e.position.distanceTo(here) < 6)
    .slice(0, 4);
  for (const drop of drops) {
    if (signal.aborted) return;
    try {
      await mc.pathfinder.goto(new GoalNear(drop.position.x, drop.position.y, drop.position.z, 0));
    } catch {
      /* drop inaccessible : on continue */
    }
  }
}

/** Cherche le bloc cible le plus proche qui n'a pas déjà échoué. */
function findTargetBlock(mc, source, failed) {
  return mc.findBlock({
    matching: (b) => b && blockMatches(source, b.name) && !failed.has(pos2key(b.position)),
    maxDistance: SEARCH_DISTANCE,
    count: 1,
  });
}

/** Se place à une altitude adaptée au minerai (ou explore à altitude constante). */
async function moveForSearch(mc, source, trips, signal, log) {
  if (trips >= MAX_EXPLORE_TRIPS) throw new Error(`aucun ${source.label || source.key} trouvé à proximité`);
  const p = mc.entity.position;
  const useDepth = source.preferredY !== null && source.preferredY !== undefined && Math.abs(p.y - source.preferredY) > 8;
  const angle = Math.random() * Math.PI * 2;
  const target = useDepth
    ? { x: Math.floor(p.x), y: source.preferredY, z: Math.floor(p.z) }
    : { x: Math.floor(p.x + Math.cos(angle) * EXPLORE_STEP), y: Math.floor(p.y), z: Math.floor(p.z + Math.sin(angle) * EXPLORE_STEP) };
  log.info(useDepth ? `Je descends vers y=${target.y} (altitude favorable)` : `Je explore vers ${target.x} ${target.z}`);
  if (signal.aborted) throw new Error('annulé');
  await mc.pathfinder.goto(new GoalNear(target.x, target.y, target.z, 3));
}

/**
 * Récolte jusqu'à ce que l'inventaire contienne `target` unités de la ressource.
 * @returns {Promise<{gathered:number, digs:number}>}
 */
async function collectResource(mc, services, source, target, signal, log) {
  const { data, planner } = services;
  const opts = { log, signal, gather: services.gather, planner };
  const failed = new Set();
  let trips = 0;
  let digs = 0;
  let fails = 0;
  const start = collectedCount(mc, source);

  while (collectedCount(mc, source) < target) {
    if (signal.aborted) throw new Error('annulé');
    if (fails >= MAX_CONSECUTIVE_FAILS) throw new Error(`trop d'échecs consécutifs sur ${source.key}`);

    const block = findTargetBlock(mc, source, failed);
    if (!block) {
      trips += 1;
      try {
        await moveForSearch(mc, source, trips - 1, signal, log);
      } catch (err) {
        if (signal.aborted || err.message === 'annulé' || err.message.startsWith('aucun ')) throw err;
        // Déplacement raté (chemin, chunk non chargé…) : on compte l'échec et on réessaie.
        log.warn(`Déplacement de recherche échoué : ${err.message}`);
        log.warn(err.stack);
        fails += 1;
      }
      continue;
    }

    try {
      if (block.position.distanceTo(mc.entity.position) > 4) await goNear(mc, block.position, 3);

      // Outil : le meilleur possédé, sinon on fabrique le plus faible autorisé.
      const allowed = allowedToolsFor(data, block);
      if (allowed) {
        const owned = mc.inventory.items().map((i) => i.name);
        let tool = bestOwnedTool(allowed, owned);
        if (!tool) {
          const cheapest = cheapestAllowedTool(allowed);
          log.info(`Il me faut un outil : je fabrique ${cheapest}`);
          await craftItem(mc, planner, cheapest, 1, opts);
          tool = cheapest;
        }
        const item = mc.inventory.items().find((i) => i.name === tool);
        if (item && (!mc.heldItem || mc.heldItem.name !== tool)) await mc.equip(item, 'hand');
      }

      if (!mc.canDigBlock(block)) {
        failed.add(pos2key(block.position));
        continue;
      }
      const before = collectedCount(mc, source);
      await mc.dig(block);
      digs += 1;
      await new Promise((r) => setTimeout(r, 250));
      const after = mc.blockAt(block.position);
      if (after && after.name !== 'air') throw new Error('le bloc est toujours là après extraction');
      await pickUpNearbyDrops(mc, signal);
      const gained = collectedCount(mc, source) - before;
      log.action(`Récolté ${block.name} (+${gained} ${source.key})`);
      fails = 0;
    } catch (err) {
      if (signal.aborted) throw new Error('annulé');
      failed.add(pos2key(block.position));
      fails += 1;
      log.warn(`Bloc ${block.name} ignoré : ${err.message}`);
    }
  }
  return { gathered: collectedCount(mc, source) - start, digs };
}

/** Enregistre le résultat dans la mémoire procédurale. */
function remember(services, key, run) {
  if (!services.memory) return;
  services.memory.recordRun(`collect:${key}`, run);
  services.memory.save();
}

function createGatheringModule() {
  return {
    name: 'gathering',

    attach(mc, services) {
      // Fourni à l'exécuteur de craft : récolter une matière manquante.
      services.gather = async (leafName, amount, signal) => {
        const source = sourceFor(leafName);
        if (!source) throw new Error(`je ne sais pas récolter ${leafName}`);
        const target = (leafName === 'log' ? countOf(mc, 'log') : countOf(mc, source.drop || source.key)) + amount;
        const log = createLogger('GATHER');
        await collectResource(mc, services, source, target, signal, log);
      };
      return () => {};
    },

    commands: [
      {
        name: 'collect',
        aliases: ['ramene', 'recolte', 'mine'],
        minRole: 'TRUSTED',
        action: true,
        usage: '!collect <bois|cobblestone|raw_iron|diamond|…> [quantité]',
        description: 'Récolte une ressource jusqu\'à la quantité demandée',
        async run(ctx, args) {
          const key = (args[0] || '').toLowerCase();
          const source = sourceFor(key);
          if (!source) return `Ressource inconnue "${key}". Ex : log, cobblestone, raw_iron, coal, diamond.`;
          const amount = Number(args[1] || 1);
          if (!Number.isInteger(amount) || amount < 1 || amount > 2304) return 'Quantité invalide (1 à 2304).';

          const { services } = ctx;
          const { tasks } = services;
          const current = tasks.describe();
          if (current.active) return `Je suis déjà occupé : ${current.name}. (!cancel pour arrêter)`;

          // Quantité = total visé dans l'inventaire (ex. "ramène 16 bois").
          const targetTotal = amount;
          const startTask = () =>
            tasks.start(`collect ${source.key} ${targetTotal}`, async (signal) => {
              const mc = services.getBot();
              const log = createLogger('GATHER');
              const started = Date.now();
              try {
                const result = await collectResource(mc, services, source, targetTotal, signal, log);
                remember(services, source.key, {
                  strategy: { preferredY: source.preferredY ?? null, method: 'nearest' },
                  success: true,
                  durationMs: Date.now() - started,
                  actions: result.digs,
                  yield: result.gathered,
                });
                services.say(`Terminé : ${collectedCount(mc, source)} ${source.label || source.key} dans l'inventaire.`);
              } catch (err) {
                remember(services, source.key, {
                  strategy: { preferredY: source.preferredY ?? null, method: 'nearest' },
                  success: false,
                  durationMs: Date.now() - started,
                  actions: 0,
                  yield: 0,
                });
                if (err.message !== 'annulé') {
                  log.error(`Récolte échouée : ${err.stack || err.message}`);
                  services.say(`Je n'ai pas pu finir : ${err.message}`);
                }
                throw err;
              }
            }).catch(() => {});

          // Dangereux : grosse quantité de ressource rare → confirmation d'abord.
          if (source.rare && amount >= RARE_CONFIRM_THRESHOLD && services.gate) {
            services.gate.request(ctx.username, `collect ${key} ${amount}`, () => {
              startTask();
              return `Je lance la récolte de ${amount} ${source.label || key}.`;
            });
            return `Ressource rare (${source.label}) : ${amount} demandés. Tapez !confirm pour valider.`;
          }
          startTask();
          return `Je pars récolter ${amount} ${source.label || key}.`;
        },
      },
    ],
  };
}

module.exports = { createGatheringModule, collectResource, allowedToolsFor, collectedCount };
