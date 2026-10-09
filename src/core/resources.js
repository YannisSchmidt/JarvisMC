'use strict';
/**
 * Connaissance des ressources : quels blocs donnent quels items, où les chercher,
 * quels outils sont nécessaires, quantités par défaut. Données pures.
 */

/**
 * Sources de récolte. Clé = matière demandée (item). `blocks` = noms de blocs
 * à miner (une regex est aussi acceptée pour les familles, ex. toutes les bûches).
 * `preferredY` = altitude où le minerai est le plus fréquent (version 1.18+).
 */
const SOURCES = Object.freeze({
  log: { blocks: /_log$/, items: /_log$/, preferredY: null, label: 'bois' },
  cobblestone: { blocks: ['stone'], drop: 'cobblestone', preferredY: null, label: 'pierre' },
  raw_iron: { blocks: ['iron_ore', 'deepslate_iron_ore'], drop: 'raw_iron', preferredY: 16, label: 'fer brut' },
  raw_gold: { blocks: ['gold_ore', 'deepslate_gold_ore'], drop: 'raw_gold', preferredY: -16, label: 'or brut' },
  raw_copper: { blocks: ['copper_ore', 'deepslate_copper_ore'], drop: 'raw_copper', preferredY: 48, label: 'cuivre brut' },
  coal: { blocks: ['coal_ore', 'deepslate_coal_ore'], drop: 'coal', preferredY: 50, label: 'charbon' },
  diamond: { blocks: ['diamond_ore', 'deepslate_diamond_ore'], drop: 'diamond', preferredY: -59, label: 'diamant', rare: true },
  redstone: { blocks: ['redstone_ore', 'deepslate_redstone_ore'], drop: 'redstone', preferredY: -59, label: 'redstone' },
  lapis_lazuli: { blocks: ['lapis_ore', 'deepslate_lapis_ore'], drop: 'lapis_lazuli', preferredY: 0, label: 'lapis-lazuli' },
  emerald: { blocks: ['emerald_ore', 'deepslate_emerald_ore'], drop: 'emerald', preferredY: 0, label: 'émeraude', rare: true },
  sand: { blocks: ['sand'], drop: 'sand', preferredY: null, label: 'sable' },
});

/** Ordre de qualité des outils (du plus faible au plus fort). */
const TOOL_TIERS = ['wooden', 'stone', 'golden', 'iron', 'diamond', 'netherite'];

/** Quantité par défaut quand l'utilisateur ne précise pas (chiffres raisonnables). */
const DEFAULT_COUNTS = Object.freeze({ log: 16, cobblestone: 64, coal: 16, raw_iron: 16, default: 8 });

/** Au-delà de ce nombre, une récolte de ressource rare demande une confirmation. */
const RARE_CONFIRM_THRESHOLD = 10;

const STACK = 64;

/** Trouve la source de récolte d'un item demandé (ou null). */
function sourceFor(itemName) {
  if (SOURCES[itemName]) return { key: itemName, ...SOURCES[itemName] };
  if (/_log$/.test(itemName)) return { key: 'log', ...SOURCES.log };
  return null;
}

/** Nom du bloc récoltable qui correspond à une source. */
function blockMatches(source, blockName) {
  if (source.blocks instanceof RegExp) return source.blocks.test(blockName);
  return source.blocks.includes(blockName);
}

/** Vrai si l'item est une bûche (toute essence). */
function isLog(itemName) {
  return /_log$/.test(itemName);
}

/**
 * Choisit l'outil à utiliser pour un bloc, parmi l'inventaire.
 * @param {Set<string>} allowedTools  noms d'outils pouvant récolter le bloc
 * @param {string[]} owned            noms d'items possédés
 * @returns {string|null} meilleur outil possédé
 */
function bestOwnedTool(allowedTools, owned) {
  const candidates = owned.filter((n) => allowedTools.has(n));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => toolRank(b) - toolRank(a));
  return candidates[0];
}

/** Rang d'un outil (plus haut = meilleur). */
function toolRank(itemName) {
  const tier = itemName.split('_')[0];
  const idx = TOOL_TIERS.indexOf(tier);
  return idx < 0 ? -1 : idx;
}

/** Outil le plus faible de l'ensemble autorisé (celui à fabriquer en priorité). */
function cheapestAllowedTool(allowedTools) {
  return [...allowedTools].sort((a, b) => toolRank(a) - toolRank(b))[0] || null;
}

/** Nombre d'items dans une pile de `n` stacks. */
function stacksToItems(n) {
  return n * STACK;
}

module.exports = {
  SOURCES,
  DEFAULT_COUNTS,
  RARE_CONFIRM_THRESHOLD,
  TOOL_TIERS,
  sourceFor,
  blockMatches,
  isLog,
  bestOwnedTool,
  cheapestAllowedTool,
  toolRank,
  stacksToItems,
};
