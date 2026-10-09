'use strict';
/**
 * Plans de construction (pur, sans serveur).
 *
 * Un plan = { name, blocks: [{x,y,z,name,kind}] }
 *  - kind 'exact' : le bloc doit être exactement `name` après construction
 *  - kind 'solid' : n'importe quel bloc plein convient (ex. le sol existant)
 */

const FACES = Object.freeze([
  [0, 1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0, -1, 0],
]);

const MAX_BRIDGE_LENGTH = 64;

const posKey = (p) => `${p.x},${p.y},${p.z}`;

/**
 * Maison simple : sol au niveau `origin.y`, murs jusqu'à `height`, toit plein,
 * ouverture (porte) au centre de la face avant (z minimum), sur 2 blocs de haut.
 * @param {{x:number,y:number,z:number}} origin coin inférieur (couche du sol)
 */
function makeHouse(origin, { width = 5, depth = 5, height = 4, wall = 'oak_planks', floor = 'cobblestone', roof = 'oak_planks' } = {}) {
  if (width < 3 || depth < 3 || height < 3) throw new Error('maison trop petite (min 3×3×3)');
  const blocks = [];
  const { x: x0, y: y0, z: z0 } = origin;
  const x1 = x0 + width - 1;
  const z1 = z0 + depth - 1;
  const doorX = x0 + Math.floor(width / 2);

  for (let x = x0; x <= x1; x += 1) {
    for (let z = z0; z <= z1; z += 1) {
      blocks.push({ x, y: y0, z, name: floor, kind: 'solid' });
    }
  }
  for (let h = 1; h < height; h += 1) {
    for (let x = x0; x <= x1; x += 1) {
      for (let z = z0; z <= z1; z += 1) {
        const onWall = x === x0 || x === x1 || z === z0 || z === z1;
        if (!onWall) continue;
        const isDoor = z === z0 && x === doorX && h <= 2;
        if (isDoor) continue;
        blocks.push({ x, y: y0 + h, z, name: wall, kind: 'exact' });
      }
    }
  }
  for (let x = x0; x <= x1; x += 1) {
    for (let z = z0; z <= z1; z += 1) {
      blocks.push({ x, y: y0 + height, z, name: roof, kind: 'exact' });
    }
  }
  return { name: 'house', blocks, door: { x: doorX, y: y0 + 1, z: z0 } };
}

/**
 * Pont droit : trajet en X puis en Z, tablier posé sur la couche `deckY`.
 * @param {{x,y,z}} from  point de départ (le bot)
 * @param {{x,y,z}} to    destination (seule x/z sont utilisées)
 */
function makeBridge(from, to, { deckY = from.y - 1, material = 'cobblestone' } = {}) {
  const path = [];
  const stepX = Math.sign(to.x - from.x);
  const stepZ = Math.sign(to.z - from.z);
  let x = from.x;
  let z = from.z;
  while (x !== to.x) {
    x += stepX;
    path.push({ x, z });
  }
  while (z !== to.z) {
    z += stepZ;
    path.push({ x, z });
  }
  if (path.length === 0) throw new Error('destination identique au départ');
  if (path.length > MAX_BRIDGE_LENGTH) throw new Error(`pont trop long (${path.length} blocs, max ${MAX_BRIDGE_LENGTH})`);
  const blocks = path.map((p) => ({ x: p.x, y: deckY, z: p.z, name: material, kind: 'solid' }));
  return { name: 'bridge', blocks };
}

/**
 * Ordonne les blocs : couche par couche (le sol avant les murs), puis les plus
 * proches de la position de départ en premier. Un bloc a donc presque toujours
 * un support déjà posé.
 */
function orderBlocks(blocks, start) {
  const dist = (b) => Math.abs(b.x - start.x) + Math.abs(b.z - start.z);
  return [...blocks].sort((a, b) => a.y - b.y || dist(a) - dist(b));
}

/** Quantités de chaque matière nécessaires pour les blocs listés (ex. { cobblestone: 25 }). */
function materialsFor(blocks) {
  const out = {};
  for (const b of blocks) out[b.name] = (out[b.name] || 0) + 1;
  return out;
}

/** Vrai si le bloc actuel satisfait déjà le plan. */
function isSatisfied(block, currentName) {
  if (currentName === undefined || currentName === null) return false;
  if (block.kind === 'solid') return currentName !== 'air';
  return currentName === block.name;
}

/**
 * Compare un plan au monde observé.
 * @param {object[]} blocks
 * @param {(pos:{x,y,z})=>string|null} nameAt  nom du bloc observé (null = inconnu)
 * @returns {{ok:boolean, total:number, bad:object[], unknown:number}}
 */
function verifyBlocks(blocks, nameAt) {
  const bad = [];
  let unknown = 0;
  for (const b of blocks) {
    const actual = nameAt(b);
    if (actual === null || actual === undefined) {
      unknown += 1;
      continue;
    }
    if (!isSatisfied(b, actual)) bad.push({ ...b, actual });
  }
  return { ok: bad.length === 0 && unknown === 0, total: blocks.length, bad, unknown };
}

module.exports = {
  FACES,
  posKey,
  makeHouse,
  makeBridge,
  orderBlocks,
  materialsFor,
  isSatisfied,
  verifyBlocks,
  MAX_BRIDGE_LENGTH,
};
