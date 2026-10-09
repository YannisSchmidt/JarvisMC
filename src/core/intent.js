'use strict';
/**
 * Compréhension du langage naturel (français) — version déterministe, sans modèle.
 *
 * parseIntent(texte, {username}) renvoie :
 *   { command: '!collect log 16' }  → la phrase correspond à une commande existante
 *   { reply: '...' }                → reconnu, mais pas encore implémenté (réponse honnête)
 *   null                            → non compris (on demande une reformulation)
 *
 * Le parseur ne fait JAMAIS d'action lui-même : il produit une commande, que le
 * registre de commandes exécute avec les permissions habituelles.
 * Un LLM pourra remplacer cette fonction plus tard, avec la même interface.
 */

const DEFAULT_STACK = 64;

/** Matières : mots français → nom d'item (pour la récolte et le craft). */
const MATERIALS = [
  [/\b(bois|buches?|bûches?|troncs?|arbres?)\b/, 'log'],
  [/\b(pierres?|cailloux?|cobble(stone)?)\b/, 'cobblestone'],
  [/\b(diamants?)\b/, 'diamond'],
  [/\b(charbons?)\b/, 'coal'],
  [/\b(redstone)\b/, 'redstone'],
  [/\b(lapis(-| )?lazuli|lapis)\b/, 'lapis_lazuli'],
  [/\b(emeraudes?)\b/, 'emerald'],
  [/\b(sables?)\b/, 'sand'],
  [/\b(cuivres?)\b/, 'raw_copper'],
  [/\b(ors?)\b/, 'raw_gold'],
  [/\b(fers?)\b/, 'raw_iron'],
];

const TOOLS = [
  [/\b(pioches?)\b/, 'pickaxe'],
  [/\b(haches?)\b/, 'axe'],
  [/\b(pelles?)\b/, 'shovel'],
  [/\b(epees?)\b/, 'sword'],
  [/\b(houes?)\b/, 'hoe'],
];

const TIERS = [
  [/\b(en |de )?bois\b/, 'wooden'],
  [/\b(en |de )?pierre\b/, 'stone'],
  [/\b(en |de )?fer\b/, 'iron'],
  [/\b(en |d'|de )?or\b|\bdoree?s?\b/, 'golden'],
  [/\b(en |de )?diamant\b/, 'diamond'],
  [/\b(en |de )?netherite\b/, 'netherite'],
];

const ARMOR_PIECES = [
  [/\bcasques?\b/, 'helmet'],
  [/\bplastrons?\b/, 'chestplate'],
  [/\b(pantalons?|jambieres?)\b/, 'leggings'],
  [/\bbottes?\b/, 'boots'],
];

const NUMBER_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };

/** Minuscules, sans accents, espaces normalisés. */
function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quantité demandée (chiffres, mots, « N stacks »). null si absente. */
function parseCount(text) {
  const stack = text.match(/(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+stacks?\b/);
  if (stack) return toNumber(stack[1]) * DEFAULT_STACK;
  const num = text.match(/\b(\d+)\b/);
  if (num) return Number(num[1]);
  const word = text.match(/\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b/);
  if (word) return toNumber(word[1]);
  return null;
}

function toNumber(token) {
  return /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
}

/** Matière première demandée dans la phrase (ou null). */
function findMaterial(text) {
  for (const [re, name] of MATERIALS) if (re.test(text)) return name;
  return null;
}

/**
 * Item fabriqué demandé : "pioche en diamant" → diamond_pickaxe ;
 * "lingot de fer" → iron_ingot ; "armure" → set (géré à part).
 */
function findCraftItem(raw) {
  const text = normalize(raw);
  if (/\blingots?\b/.test(text) && /\bfer\b/.test(text)) return 'iron_ingot';
  if (/\blingots?\b/.test(text) && /\bor\b/.test(text)) return 'gold_ingot';
  const tool = TOOLS.find(([re]) => re.test(text));
  if (tool) {
    const tier = TIERS.find(([re]) => re.test(text));
    if (!tier) return null;
    return `${tier[1]}_${tool[1]}`;
  }
  if (/\b(bloc de|blocs de)? ?(table|etabli)\b/.test(text) || /\btable de craft\b/.test(text)) return 'crafting_table';
  if (/\bfour\b/.test(text)) return 'furnace';
  if (/\bcoffres?\b/.test(text)) return 'chest';
  return null;
}

/** Pièce d'armure ou armure complète demandée. */
function findArmor(text) {
  const tier = TIERS.find(([re]) => re.test(text));
  if (!tier) return null;
  const piece = ARMOR_PIECES.find(([re]) => re.test(text));
  return { material: tier[1], piece: piece ? piece[1] : null };
}

/** Phrases reconnues mais non encore implémentées → réponse honnête. */
const NOT_IMPLEMENTED = [
  [/\b(village|villages)\b/, 'chercher les villages'],
  [/\b(forteresse|bastion|stronghold|portail)\b/, 'chercher les structures'],
  [/\b(ender|dragon)\b/, 'combattre l\'Ender Dragon'],
  [/\b(elytra|elytres?)\b/, 'obtenir une élytre'],
  [/\b(ferme|fermes|farm|farms)\b/, 'construire des fermes'],
  [/\b(murs?|fermes?)\b/, 'construire des murs'],
  [/\b(coffres?|range|rangement)\b/, 'ranger dans les coffres'],
  [/\b(redstone|piston|levier|comparateur|repeteur)\b/, 'construire des circuits redstone'],
  [/\b(echange|echanger|villageois|trader|troc)\b/, 'faire du commerce'],
  [/\b(nether|end|dimension)\b/, 'voyager entre dimensions'],
];

/**
 * @param {string} text
 * @param {{username?: string}} ctx  joueur qui parle (pour "suis-moi")
 * @returns {{command?:string, reply?:string}|null}
 */
function parseIntent(text, { username = null } = {}) {
  const t = normalize(text);
  if (!t) return null;

  // Téléportation : impossible sans droits d'opérateur.
  if (/\b(teleporte|teleporter|teleport)\b/.test(t)) {
    return { reply: "Je ne peux pas me téléporter : il me faut les droits d'opérateur (et la commande /tp n'est pas encore branchée)." };
  }

  // Contrôle simple.
  if (/\b(arrete|arretes|stop|pause)\b/.test(t)) return { command: '!stop' };
  if (/\b(reprends|reprend|reprendre|continue)\b/.test(t)) return { command: '!resume' };
  if (/\b(annule|annuler|laisse tomber)\b/.test(t)) return { command: '!cancel' };

  // Suivre / défendre.
  if (/\bsuis[- ]?moi\b|\bsuivre? moi\b/.test(t) && username) return { command: `!follow ${username}` };
  if (/\bdefends?[- ](moi|toi)\b|\bprotege[sz]?[- ]moi\b|\bgarde[- ]moi\b/.test(t)) return { command: '!defend on' };

  // Statut / inventaire.
  if (/\b(ton inventaire|tu as quoi|qu'?est[- ]ce que tu as|inventaire)\b/.test(t)) return { command: '!inventory' };
  if (/\b(comment ca va|statut|status|ca va)\b/.test(t)) return { command: '!status' };

  // Sommeil et base.
  if (/\b(va dormir|dors|dormir|couche[- ]toi)\b/.test(t)) return { command: '!sleep' };
  if (/\b(rentre|retourne|reviens|va)\b.*\b(base|maison)\b/.test(t)) return { command: '!base' };

  // Position explicite.
  const coords = t.match(/(-?\d+)\s+(-?\d+)\s+(-?\d+)/);
  if (coords && /\b(va|aller|rends|rejoins|goto)\b/.test(t)) return { command: `!goto ${coords[1]} ${coords[2]} ${coords[3]}` };

  // Armure complète ou pièce.
  if (/\b(armure|armures|casque|plastron|bottes|pantalon|jambieres)\b/.test(t) && TIERS.some(([re]) => re.test(t))) {
    const armor = findArmor(t);
    if (armor && armor.piece) return { command: `!craft ${armor.material}_${armor.piece} 1` };
    if (armor) return { command: `!armor ${armor.material}` };
  }

  // Fabrication d'un outil précis.
  if (/\b(fais|faire|fabrique|fabriquer|craft|crafte|crafter|prepare)\b/.test(t)) {
    const item = findCraftItem(t);
    if (item) return { command: `!craft ${item} ${parseCount(t) || 1}` };
  }

  // Construction : maison simple devant le bot, pont jusqu'à une cible.
  if (/\b(construis|construire|fais|fabrique)\b.*\b(maison|base|cabane|abri)\b|\b(maison|cabane|abri)\b.*\b(construis|construire)\b/.test(t)) {
    return { command: '!build house' };
  }
  if (/\b(pont|passerelle)\b/.test(t) && coords) {
    return { command: `!build bridge ${coords[1]} ${coords[2]} ${coords[3]}` };
  }

  // Récolte : bois, pierre, minerais.
  if (/\b(va chercher|cherche|ramene|ramener|recolte|recolter|collecte|collecter|mine|miner|trouve|trouver|apporte|rapporte)\b/.test(t)) {
    const material = findMaterial(t);
    if (material) {
      const count = parseCount(t);
      return { command: `!collect ${material} ${count || defaultCount(material)}` };
    }
  }

  // Phrases reconnues mais non implémentées.
  for (const [re, label] of NOT_IMPLEMENTED) {
    if (re.test(t)) return { reply: `Je ne peux pas encore ${label}. Ce n'est pas implémenté pour le moment.` };
  }

  return null;
}

/** Quantité par défaut raisonnable pour une récolte sans nombre. */
function defaultCount(material) {
  if (material === 'log') return 16;
  if (material === 'cobblestone') return 64;
  if (material === 'raw_iron') return 16;
  return 8;
}

module.exports = { parseIntent, normalize, parseCount, findCraftItem };
