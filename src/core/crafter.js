'use strict';
/**
 * Exécution des plans de crafting sur le bot réel.
 *
 * Boucle : planifier → exécuter UNE étape → revérifier l'inventaire → replanifier.
 * Les matières manquantes sont demandées à `opts.gather(nom, quantité, signal)`
 * (fourni par le module de récolte). Rien n'est considéré fait sans vérification.
 */
const Vec3 = require('vec3');
const { familyOf } = require('./crafting-planner');
const { sourceFor } = require('./resources');

const MAX_REPLAN = 12;
const FURNACE_SECONDS_PER_ITEM = 10;
const COAL_PER_ITEMS = 8;

/** Compte les items de l'inventaire par nom, famille comprise si demandé. */
function inventoryCounts(mc) {
  const counts = {};
  for (const item of mc.inventory.items()) counts[item.name] = (counts[item.name] || 0) + item.count;
  return counts;
}

/** Quantité possédée d'un item (ou d'une famille : "log", "planks"). */
function countOf(mc, name) {
  const fam = familyOf(name);
  return mc.inventory.items().reduce((sum, item) => (familyOf(item.name) === fam ? sum + item.count : sum), 0);
}

function itemByName(mc, name) {
  return mc.inventory.items().find((i) => i.name === name) || null;
}

/** Vrai si un bloc de la liste est proche (rayon en blocs). */
function findNearbyBlock(mc, names, radius = 4) {
  const list = Array.isArray(names) ? names : [names];
  return mc.findBlock({ matching: (b) => b && list.includes(b.name), maxDistance: radius });
}

/** Se rapproche d'une position (pathfinder). */
async function goNear(mc, pos, range = 2) {
  const { goals } = require('mineflayer-pathfinder');
  await mc.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, range));
}

/**
 * Place un bloc de l'inventaire à côté du bot. Vérifie le résultat.
 * @returns {Promise<Vec3>} position du bloc posé
 */
async function placeNear(mc, itemName) {
  const item = itemByName(mc, itemName);
  if (!item) throw new Error(`je n'ai pas de ${itemName} à poser`);
  await mc.equip(item, 'hand');
  const base = mc.entity.position.floored();
  const candidates = [];
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dz = -2; dz <= 2; dz += 1) {
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue; // pas sous le bot
      candidates.push(base.offset(dx, 0, dz));
    }
  }
  for (const pos of candidates) {
    const target = mc.blockAt(pos);
    const below = mc.blockAt(pos.offset(0, -1, 0));
    if (!target || !below || target.name !== 'air' || below.boundingBox !== 'block') continue;
    await mc.placeBlock(below, new Vec3(0, 1, 0));
    const placed = mc.blockAt(pos);
    if (placed && placed.name === itemName) return pos;
  }
  throw new Error(`pas de place libre pour poser ${itemName}`);
}

/** Trouve ou pose une table de craft ; renvoie le bloc table (ou null si non requise). */
async function ensureCraftingTable(mc, planner, opts) {
  const existing = findNearbyBlock(mc, 'crafting_table', 4);
  if (existing) return existing;
  if (!itemByName(mc, 'crafting_table')) {
    await craftItem(mc, planner, 'crafting_table', 1, opts);
  }
  const pos = await placeNear(mc, 'crafting_table');
  opts.log.action(`Table de craft posée en ${pos.x} ${pos.y} ${pos.z}`);
  return mc.blockAt(pos);
}

/** Exécute UNE étape de craft (recette réelle du jeu). Vérifie le résultat. */
async function executeCraftStep(mc, planner, step, opts) {
  const { data } = planner;
  const table = step.requiresTable ? await ensureCraftingTable(mc, planner, opts) : null;
  if (table) await goNear(mc, table.position, 3);

  const candidates = [step.name];
  if (familyOf(step.name) === 'planks') {
    for (const item of Object.values(data.itemsByName)) {
      if (/_planks$/.test(item.name) && !candidates.includes(item.name)) candidates.push(item.name);
    }
  }
  let recipe = null;
  let chosen = null;
  for (const name of candidates) {
    const id = data.itemsByName[name] && data.itemsByName[name].id;
    if (id === undefined) continue;
    const found = mc.recipesFor(id, null, 1, table);
    if (found.length) {
      recipe = found[0];
      chosen = name;
      break;
    }
  }
  if (!recipe) throw new Error(`ingrédients manquants pour ${step.name}`);

  const before = countOf(mc, chosen);
  await mc.craft(recipe, step.times, table);
  const gained = countOf(mc, chosen) - before;
  if (gained < step.produces && familyOf(chosen) !== 'log') {
    throw new Error(`craft de ${chosen} non vérifié (+${gained}/${step.produces})`);
  }
  opts.log.action(`Fabriqué ${chosen} x${gained}`);
}

/** Fond des matières via un four (fuel = charbon). Vérifie les lingots obtenus. */
async function executeSmeltStep(mc, planner, step, opts) {
  const { data } = planner;
  const furnaceBlock = findNearbyBlock(mc, 'furnace', 4);
  let furnaceBlockPos;
  if (furnaceBlock) {
    furnaceBlockPos = furnaceBlock;
  } else {
    if (!itemByName(mc, 'furnace')) await craftItem(mc, planner, 'furnace', 1, opts);
    furnaceBlockPos = mc.blockAt(await placeNear(mc, 'furnace'));
  }
  await goNear(mc, furnaceBlockPos.position, 3);

  const fuelNeeded = Math.ceil(step.times / COAL_PER_ITEMS) || 1;
  if (countOf(mc, 'coal') < fuelNeeded) await opts.gather('coal', fuelNeeded - countOf(mc, 'coal'), opts.signal);

  const inputId = data.itemsByName[step.from].id;
  const fuelId = data.itemsByName.coal.id;
  const before = countOf(mc, step.name);

  const furnace = await mc.openFurnace(furnaceBlockPos);
  try {
    await furnace.putFuel(fuelId, null, fuelNeeded);
    await furnace.putInput(inputId, null, step.times);
    const deadline = Date.now() + (step.times * FURNACE_SECONDS_PER_ITEM + 15) * 1000;
    while (Date.now() < deadline) {
      if (opts.signal.aborted) throw new Error('annulé');
      const out = furnace.outputItem();
      if (out && out.count >= step.times) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (furnace.outputItem()) await furnace.takeOutput();
    if (furnace.inputItem()) await furnace.takeInput();
  } finally {
    mc.closeWindow(furnace);
  }
  const gained = countOf(mc, step.name) - before;
  if (gained < step.produces) throw new Error(`fonte de ${step.name} non vérifiée (+${gained}/${step.produces})`);
  opts.log.action(`Fondu ${step.name} x${gained}`);
}

/**
 * Fabrique `count` × `name` (inventaire déjà pris en compte).
 * @returns {Promise<void>} lève une erreur si l'objectif n'est pas atteint
 */
async function craftItem(mc, planner, name, count, opts) {
  const { log, signal } = opts;
  for (let round = 0; round < MAX_REPLAN; round += 1) {
    if (signal.aborted) throw new Error('annulé');
    if (countOf(mc, name) >= count) return;
    const plan = planner.planCraft(name, count - countOf(mc, name), inventoryCounts(mc));
    if (!plan.ok) throw new Error(plan.reason || `plan impossible pour ${name}`);

    const leafNames = Object.keys(plan.leaves);
    if (leafNames.length) {
      const leaf = leafNames[0];
      if (!sourceFor(leaf)) throw new Error(`je ne sais pas encore obtenir "${leaf}"`);
      await opts.gather(leaf, plan.leaves[leaf], signal);
      continue;
    }
    const step = plan.steps[0];
    if (!step) break;
    log.info(`Craft : ${step.kind === 'smelt' ? `fonte ${step.from} → ${step.name}` : `${step.name} x${step.times}`}`);
    if (step.kind === 'smelt') await executeSmeltStep(mc, planner, step, opts);
    else await executeCraftStep(mc, planner, step, opts);
  }
  if (countOf(mc, name) < count) throw new Error(`objectif non atteint : ${name} (${countOf(mc, name)}/${count})`);
}

const ARMOR_SLOTS = { helmet: 'head', chestplate: 'torso', leggings: 'legs', boots: 'feet' };
const ARMOR_RANK = ['leather', 'chainmail', 'golden', 'iron', 'diamond', 'netherite'];

/** Équipe la meilleure armure possédée sur chaque emplacement. */
async function equipBestArmor(mc) {
  const items = mc.inventory.items();
  const equipped = [];
  for (const [piece, slot] of Object.entries(ARMOR_SLOTS)) {
    const candidates = items.filter((i) => i.name.endsWith(`_${piece}`));
    if (!candidates.length) continue;
    candidates.sort((a, b) => ARMOR_RANK.indexOf(b.name.split('_')[0]) - ARMOR_RANK.indexOf(a.name.split('_')[0]));
    await mc.equip(candidates[0], slot);
    equipped.push(candidates[0].name);
  }
  return equipped;
}

module.exports = {
  craftItem,
  equipBestArmor,
  countOf,
  inventoryCounts,
  findNearbyBlock,
  goNear,
  placeNear,
  ARMOR_RANK,
};
