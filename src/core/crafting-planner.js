'use strict';
/**
 * Planificateur de crafting (pur, sans serveur).
 *
 * Entrée : données de jeu (minecraft-data), item cible, quantité, inventaire.
 * Sortie : une liste ORDONNÉE d'étapes (dépendances d'abord) et les matières
 * premières manquantes à aller chercher dans le monde (`leaves`).
 *
 * Étape : { kind: 'craft'|'smelt', name, times, produces, requiresTable }
 *
 * Règles :
 *  - les recettes viennent des données du jeu, jamais codées à la main ;
 *  - les métaux passent par la fonte (lingot ← matière brute), pas par les blocs ;
 *  - les bûches (toutes essences) et les planches forment une famille ;
 *  - les cycles de recettes sont coupés ; une matière non récoltable coûte très cher.
 */
const { sourceFor, isLog } = require('./resources');

/** Métaux obtenus par fonte : lingot ← matière première. */
const SMELT_MAP = Object.freeze({
  iron_ingot: 'raw_iron',
  gold_ingot: 'raw_gold',
  copper_ingot: 'raw_copper',
  smooth_stone: 'stone',
  glass: 'sand',
  stone: 'cobblestone',
});

const MAX_DEPTH = 10;
const UNGATHERABLE_COST = 1000;

/** Famille d'un item : toutes les bûches ensemble, toutes les planches ensemble. */
function familyOf(name) {
  if (isLog(name)) return 'log';
  if (/_planks$/.test(name)) return 'planks';
  return name;
}

/** Vrai si l'item se récolte dans le monde (bûches, minerais, pierre, sable…). */
function isGatherable(name) {
  return Boolean(sourceFor(name));
}

/** Vrai si la recette nécessite une table de craft (grille 3x3). */
function recipeNeedsTable(recipe) {
  if (recipe.inShape) {
    const rows = recipe.inShape.length;
    const cols = Math.max(...recipe.inShape.map((r) => r.length));
    return rows > 2 || cols > 2;
  }
  return (recipe.ingredients || []).length > 4;
}

/** Quantité nécessaire de chaque ingrédient (id → nombre) pour UNE exécution de la recette. */
function recipeIngredients(recipe) {
  const counts = new Map();
  const add = (id) => {
    if (id === null || id === undefined) return;
    counts.set(id, (counts.get(id) || 0) + 1);
  };
  if (recipe.inShape) recipe.inShape.forEach((row) => row.forEach(add));
  else (recipe.ingredients || []).forEach(add);
  return counts;
}

/** Fabrique un planificateur lié à des données de jeu (une version donnée). */
function createCraftPlanner(mcData) {
  const nameOf = (id) => (mcData.items[id] ? mcData.items[id].name : null);
  const recipesOf = (name) => {
    const item = mcData.itemsByName[name];
    return item && mcData.recipes[item.id] ? mcData.recipes[item.id] : [];
  };

  /** Consomme `n` unités de la famille de `name` ; renvoie le nombre réellement consommé. */
  function consume(inv, name, n) {
    const fam = familyOf(name);
    let left = n;
    for (const [k, v] of inv) {
      if (left === 0) break;
      if (familyOf(k) !== fam || v <= 0) continue;
      const take = Math.min(v, left);
      inv.set(k, v - take);
      left -= take;
    }
    return n - left;
  }

  /**
   * Produit `want` unités de `name`. Modifie `inv`. Renvoie { steps, leaves, ok }.
   * `path` contient les noms déjà en cours de production (anti-cycle).
   */
  function produce(name, want, inv, depth, path) {
    const out = { steps: [], leaves: new Map(), ok: true };
    if (want <= 0) return out;
    if (depth > MAX_DEPTH || path.has(name)) {
      out.ok = false;
      return out;
    }
    const used = consume(inv, name, want);
    const remaining = want - used;
    if (remaining === 0) return out;

    // Matière récoltable dans le monde : feuille, on ne remonte jamais dans ses recettes
    // (ex. raw_iron a une recette depuis le bloc de fer brut → cycle).
    if (isGatherable(name)) {
      out.leaves.set(familyOf(name), (out.leaves.get(familyOf(name)) || 0) + remaining);
      return out;
    }

    // Métaux et pierre lisse : fonte d'abord (évite les recettes de blocs/pépites).
    if (SMELT_MAP[name]) {
      const from = SMELT_MAP[name];
      const sub = produce(from, remaining, inv, depth + 1, new Set([...path, name]));
      mergeInto(out, sub);
      if (sub.ok) out.steps.push({ kind: 'smelt', name, from, times: remaining, produces: remaining, requiresTable: false });
      return out;
    }

    const recipes = recipesOf(name);
    if (recipes.length === 0) {
      out.leaves.set(familyOf(name), (out.leaves.get(familyOf(name)) || 0) + remaining);
      return out;
    }

    // Recette la moins coûteuse (matières manquantes pondérées).
    let best = null;
    for (const recipe of recipes) {
      const trialInv = new Map(inv);
      const trial = produceByRecipe(name, remaining, recipe, trialInv, depth, path);
      const cost = costOf(trial);
      if (!best || cost < best.cost) best = { cost, trial, trialInv };
    }
    if (!best.trial.ok) {
      out.ok = false;
      mergeInto(out, best.trial);
      return out;
    }
    for (const [k, v] of best.trialInv) inv.set(k, v);
    mergeInto(out, best.trial);
    return out;
  }

  function produceByRecipe(name, want, recipe, inv, depth, path) {
    const out = { steps: [], leaves: new Map(), ok: true };
    const outCount = recipe.result.count || 1;
    const times = Math.ceil(want / outCount);
    const nextPath = new Set([...path, name]);
    for (const [id, perCraft] of recipeIngredients(recipe)) {
      const ingredient = nameOf(id);
      if (!ingredient) {
        out.ok = false;
        return out;
      }
      mergeInto(out, produce(ingredient, perCraft * times, inv, depth + 1, nextPath));
      if (!out.ok) return out;
    }
    const produced = outCount * times;
    inv.set(name, (inv.get(name) || 0) + produced - want);
    out.steps.push({ kind: 'craft', name, times, produces: produced, requiresTable: recipeNeedsTable(recipe) });
    return out;
  }

  function costOf(result) {
    let cost = result.ok ? 0 : UNGATHERABLE_COST * 10;
    for (const [leaf, n] of result.leaves) {
      cost += sourceFor(leaf) || leaf === 'log' || leaf === 'planks' ? n : n * UNGATHERABLE_COST;
    }
    return cost + result.steps.length * 0.01;
  }

  function mergeInto(target, sub) {
    target.steps.push(...sub.steps);
    for (const [k, v] of sub.leaves) target.leaves.set(k, (target.leaves.get(k) || 0) + v);
    if (!sub.ok) target.ok = false;
  }

  /**
   * Planifie la fabrication de `count` × `targetName`.
   * @param {string} targetName   ex. "diamond_pickaxe"
   * @param {number} count
   * @param {Object<string,number>|Map} inventory  stock par nom d'item
   * @returns {{ok:boolean, steps:object[], leaves:Object<string,number>, reason?:string}}
   */
  function planCraft(targetName, count, inventory = {}) {
    if (!mcData.itemsByName[targetName]) {
      return { ok: false, steps: [], leaves: {}, reason: `item inconnu : ${targetName}` };
    }
    const inv = inventory instanceof Map ? new Map(inventory) : new Map(Object.entries(inventory));
    const res = produce(targetName, count, inv, 0, new Set());
    const leaves = Object.fromEntries(res.leaves);
    if (!res.ok) {
      return { ok: false, steps: res.steps, leaves, reason: `pas de recette réalisable pour ${targetName}` };
    }
    return { ok: true, steps: res.steps, leaves };
  }

  return { planCraft };
}

module.exports = { createCraftPlanner, SMELT_MAP, recipeNeedsTable, familyOf };
