'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeHouse, makeBridge, orderBlocks, materialsFor, isSatisfied, verifyBlocks, MAX_BRIDGE_LENGTH } = require('../../src/core/blueprint');
const { pickFace } = require('../../src/core/builder');

test('maison : sol, murs, porte ouverte, toit plein', () => {
  const h = makeHouse({ x: 0, y: 60, z: 0 }, { width: 5, depth: 5, height: 4 });
  const floor = h.blocks.filter((b) => b.y === 60);
  assert.equal(floor.length, 25);
  assert.ok(floor.every((b) => b.kind === 'solid'));
  const roof = h.blocks.filter((b) => b.y === 64);
  assert.equal(roof.length, 25);
  // porte : centre de la face z=0, 2 blocs de haut → absent
  assert.equal(h.blocks.some((b) => b.x === 2 && b.z === 0 && (b.y === 61 || b.y === 62)), false);
  assert.equal(h.blocks.some((b) => b.x === 2 && b.z === 0 && b.y === 63), true, 'au-dessus de la porte, il y a un mur');
  // intérieur : aucun bloc de mur à l'intérieur
  assert.equal(h.blocks.some((b) => b.x === 2 && b.z === 2 && b.y === 61), false);
});

test('maison : taille minimale', () => {
  assert.throws(() => makeHouse({ x: 0, y: 0, z: 0 }, { width: 2 }), /trop petite/);
});

test('pont : trajet en L, pas de doublons, longueur bornée', () => {
  const b = makeBridge({ x: 0, y: 64, z: 0 }, { x: 3, y: 70, z: -2 }, { deckY: 63 });
  assert.equal(b.blocks.length, 5);
  assert.ok(b.blocks.every((x) => x.y === 63));
  assert.equal(new Set(b.blocks.map((x) => `${x.x},${x.z}`)).size, 5);
  assert.throws(() => makeBridge({ x: 0, y: 64, z: 0 }, { x: 0, y: 64, z: 0 }), /identique/);
  assert.throws(() => makeBridge({ x: 0, y: 64, z: 0 }, { x: MAX_BRIDGE_LENGTH + 1, y: 64, z: 0 }), /trop long/);
});

test('ordre : couche par couche, puis le plus proche du départ', () => {
  const blocks = [
    { x: 5, y: 61, z: 0, name: 'a' },
    { x: 0, y: 60, z: 0, name: 'b' },
    { x: 1, y: 60, z: 0, name: 'c' },
  ];
  const o = orderBlocks(blocks, { x: 0, y: 60, z: 0 });
  assert.deepEqual(o.map((b) => b.name), ['b', 'c', 'a']);
});

test('matériaux et satisfaction', () => {
  const h = makeHouse({ x: 0, y: 60, z: 0 }, { width: 3, depth: 3, height: 3 });
  const m = materialsFor(h.blocks);
  assert.equal(m.cobblestone, 9);
  assert.equal(isSatisfied({ kind: 'solid' }, 'grass_block'), true);
  assert.equal(isSatisfied({ kind: 'solid' }, 'air'), false);
  assert.equal(isSatisfied({ kind: 'exact', name: 'oak_planks' }, 'stone'), false);
});

test('vérification : détecte les blocs faux et inconnus', () => {
  const plan = [
    { x: 0, y: 60, z: 0, name: 'stone', kind: 'exact' },
    { x: 1, y: 60, z: 0, name: 'stone', kind: 'exact' },
    { x: 2, y: 60, z: 0, name: 'stone', kind: 'exact' },
  ];
  const world = { '0,60,0': 'stone', '1,60,0': 'dirt', '2,60,0': null };
  const r = verifyBlocks(plan, (p) => world[`${p.x},${p.y},${p.z}`] ?? null);
  assert.equal(r.ok, false);
  assert.equal(r.bad.length, 1);
  assert.equal(r.unknown, 1);
  assert.equal(verifyBlocks(plan.slice(0, 1), () => 'stone').ok, true);
});

test('pose : face d\'appui choisie parmi les voisins pleins', () => {
  const solid = new Set(['0,59,0']); // seul le sol est plein
  const isSolid = (p) => solid.has(`${p.x},${p.y},${p.z}`);
  const f = pickFace({ x: 0, y: 60, z: 0 }, isSolid);
  assert.deepEqual(f.face, [0, 1, 0]);
  assert.deepEqual(f.ref, { x: 0, y: 59, z: 0 });
  assert.equal(pickFace({ x: 0, y: 60, z: 0 }, () => false), null);
});
