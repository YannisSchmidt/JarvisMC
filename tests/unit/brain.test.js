'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getGameData } = require('../../src/adapters/version');
const { createCraftPlanner, SMELT_MAP, familyOf } = require('../../src/core/crafting-planner');
const { parseIntent, parseCount, findCraftItem } = require('../../src/core/intent');
const { sourceFor, bestOwnedTool, cheapestAllowedTool, blockMatches } = require('../../src/core/resources');
const { MemoryStore } = require('../../src/memory/store');
const { ConfirmationGate } = require('../../src/core/safety');
const { runSteps, PlanError } = require('../../src/core/plan');
const { chooseTarget, isHostileMob, bestSword } = require('../../src/modules/combat');
const { parseIntent: parse2 } = require('../../src/core/intent');

const data = getGameData('1.21.1');
const planner = createCraftPlanner(data);
const Vec3 = require('vec3');

// ---------- planificateur de craft ----------
test('planner : bois puis outil en bois → bûches manquantes uniquement', () => {
  const p = planner.planCraft('wooden_pickaxe', 1, {});
  assert.equal(p.ok, true);
  assert.deepEqual(p.leaves, { log: 2 });
  assert.equal(p.steps[p.steps.length - 1].name, 'wooden_pickaxe');
  assert.equal(p.steps[p.steps.length - 1].requiresTable, true);
});

test('planner : pioche en fer sans fer → fonte du fer brut puis craft', () => {
  const p = planner.planCraft('iron_pickaxe', 1, {});
  assert.equal(p.ok, true);
  assert.equal(p.leaves.raw_iron, 3);
  assert.equal(p.steps[0].kind, 'smelt');
  assert.equal(p.steps[0].from, 'raw_iron');
  assert.equal(p.steps[p.steps.length - 1].name, 'iron_pickaxe');
});

test('planner : pioche en diamant → 3 diamants à miner', () => {
  const p = planner.planCraft('diamond_pickaxe', 1, {});
  assert.equal(p.ok, true);
  assert.equal(p.leaves.diamond, 3);
});

test('planner : inventaire suffisant → aucune étape', () => {
  const p = planner.planCraft('iron_pickaxe', 1, { iron_ingot: 3, stick: 2, oak_planks: 0, cobblestone: 0 });
  assert.deepEqual(p.leaves, {});
  assert.equal(p.steps.filter((s) => s.name === 'iron_pickaxe').length, 1);
});

test('planner : armure complète = 8 diamants pour un plastron', () => {
  const p = planner.planCraft('diamond_chestplate', 1, {});
  assert.equal(p.leaves.diamond, 8);
});

test('planner : item inconnu refusé proprement', () => {
  const p = planner.planCraft('pioche_magique', 1, {});
  assert.equal(p.ok, false);
  assert.match(p.reason, /inconnu/);
});

test('planner : terminaison garantie malgré les cycles de recettes', () => {
  // Le lingot de fer a des recettes circulaires (pépite ↔ lingot) : ne doit jamais boucler.
  const started = Date.now();
  planner.planCraft('iron_ingot', 9, {});
  planner.planCraft('iron_block', 1, {});
  planner.planCraft('diamond_block', 1, {});
  assert.ok(Date.now() - started < 2000);
});

test('planner : familles bûches et planches', () => {
  assert.equal(familyOf('spruce_log'), 'log');
  assert.equal(familyOf('birch_planks'), 'planks');
  assert.equal(familyOf('stick'), 'stick');
  assert.equal(SMELT_MAP.iron_ingot, 'raw_iron');
});

// ---------- ressources ----------
test('ressources : sources et outils', () => {
  assert.equal(sourceFor('log').key, 'log');
  assert.equal(sourceFor('spruce_log').key, 'log');
  assert.equal(sourceFor('diamond').rare, true);
  assert.equal(sourceFor('unobtainium'), null);
  assert.equal(blockMatches(sourceFor('diamond'), 'deepslate_diamond_ore'), true);
  assert.equal(blockMatches(sourceFor('log'), 'oak_log'), true);
  assert.equal(bestOwnedTool(new Set(['wooden_pickaxe', 'iron_pickaxe']), ['wooden_pickaxe', 'iron_pickaxe']), 'iron_pickaxe');
  assert.equal(bestOwnedTool(new Set(['iron_pickaxe']), ['stone_pickaxe']), null);
  assert.equal(cheapestAllowedTool(new Set(['diamond_pickaxe', 'iron_pickaxe'])), 'iron_pickaxe');
});

// ---------- langage naturel ----------
const ctx = { username: 'Yannis' };
test('NL : phrases de la spécification → commandes', () => {
  assert.deepEqual(parseIntent('Va chercher du bois', ctx), { command: '!collect log 16' });
  assert.deepEqual(parseIntent('Ramène-moi 3 stacks de fer', ctx), { command: '!collect raw_iron 192' });
  assert.deepEqual(parseIntent('Fais-moi une pioche en diamant', ctx), { command: '!craft diamond_pickaxe 1' });
  assert.deepEqual(parseIntent('Fais une armure complète en diamant', ctx), { command: '!armor diamond' });
  assert.deepEqual(parseIntent('Suis-moi', ctx), { command: '!follow Yannis' });
  assert.deepEqual(parseIntent('Défends-moi', ctx), { command: '!defend on' });
  assert.deepEqual(parseIntent('Va dormir', ctx), { command: '!sleep' });
  assert.deepEqual(parseIntent('Rentre à la base', ctx), { command: '!base' });
  assert.deepEqual(parseIntent('Va à 10 64 -20', ctx), { command: '!goto 10 64 -20' });
  assert.deepEqual(parseIntent('Trouve des diamants', ctx), { command: '!collect diamond 8' });
  assert.deepEqual(parseIntent('Arrête tout', ctx), { command: '!stop' });
  assert.deepEqual(parseIntent('Construis-moi une maison ici', ctx), { command: '!build house' });
  assert.deepEqual(parseIntent('Fais-moi une base', ctx), { command: '!build house' });
  assert.deepEqual(parseIntent('Construis un pont jusqu\'à 10 64 -20', ctx), { command: '!build bridge 10 64 -20' });
  assert.deepEqual(parseIntent('Tu as quoi dans ton inventaire ?', ctx), { command: '!inventory' });
});

test('NL : phrases non implémentées → réponse honnête, jamais de fausse action', () => {
  for (const phrase of ['Trouve-moi un village', 'Fais une ferme à fer', 'Range tout dans les coffres', 'Prépare tout pour aller tuer l\'Ender Dragon', 'Fais ce qu\'il faut pour obtenir une Elytra']) {
    const r = parseIntent(phrase, ctx);
    assert.ok(r && r.reply && !r.command, `« ${phrase} » doit répondre sans commande : ${JSON.stringify(r)}`);
    assert.match(r.reply, /pas encore|pas implémenté|ne peux pas/i);
  }
  assert.match(parseIntent('Téléporte-moi', ctx).reply, /téléporter/);
});

test('NL : phrase incomprise → null (on demandera une précision)', () => {
  assert.equal(parseIntent('Va voir ce qu\'il y a dans cette zone', ctx), null);
  assert.equal(parseIntent('', ctx), null);
});

test('NL : quantités et outils', () => {
  assert.equal(parseCount('ramène 3 stacks'), 192);
  assert.equal(parseCount('quatre pioches'), 4);
  assert.equal(parseCount('pas de nombre'), null);
  assert.equal(findCraftItem('une hache en fer'), 'iron_axe');
  assert.equal(findCraftItem('une pelle en bois'), 'wooden_shovel');
  assert.equal(findCraftItem('une épée en pierre'), 'stone_sword');
  assert.equal(parse2('fais une épée de diamant', ctx).command, '!craft diamond_sword 1');
});

// ---------- mémoire ----------
test('mémoire : stratégie la plus fiable, persistance, fichier corrompu mis de côté', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-mem-'));
  const file = path.join(dir, 'memory.json');
  const m = new MemoryStore(file);
  m.seePlayer('Yannis', 1000);
  m.setLocation('base', { x: 1, y: 64, z: 2 });
  m.recordRun('collect:diamond', { strategy: { y: -59 }, success: true, durationMs: 600000, yield: 8 });
  m.recordRun('collect:diamond', { strategy: { y: 11 }, success: false, durationMs: 600000, yield: 0 });
  m.recordRun('collect:diamond', { strategy: { y: -59 }, success: true, durationMs: 600000, yield: 4 });
  m.save();

  const again = new MemoryStore(file);
  assert.equal(again.getLocation('base').x, 1);
  assert.equal(again.summary().players, 1);
  const best = again.bestStrategy('collect:diamond');
  assert.deepEqual(best.strategy, { y: -59 });
  assert.equal(best.runs, 2);
  assert.equal(best.successRate, 1);

  fs.writeFileSync(file, '{ cassé');
  const fresh = new MemoryStore(file);
  assert.equal(fresh.summary().players, 0);
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('corrupt')));
});

// ---------- garde de confirmation ----------
test('confirmation : action en attente, expiration, usage unique', () => {
  let now = 0;
  const gate = new ConfirmationGate({ ttlMs: 1000, now: () => now });
  gate.request('Yannis', 'collect diamond 12', () => 'ok');
  assert.equal(gate.take('bob'), null);
  assert.ok(gate.take('YANNIS'));
  assert.equal(gate.take('yannis'), null, 'usage unique');
  gate.request('Yannis', 'x', () => 'ok');
  now = 5000;
  assert.equal(gate.take('Yannis'), null, 'expirée');
});

// ---------- exécuteur de plan ----------
test('plan : réessaie jusqu\'à réussir, puis s\'arrête après le maximum', async () => {
  let calls = 0;
  await runSteps([{ label: 'flaky', run: async () => { calls += 1; if (calls < 2) throw new Error('raté'); } }], { retries: 3 });
  assert.equal(calls, 2);

  let tries = 0;
  await assert.rejects(
    runSteps([{ label: 'bloqué', run: async () => { tries += 1; throw new Error('mur'); } }], { retries: 3 }),
    (err) => err instanceof PlanError && /mur/.test(err.message)
  );
  assert.equal(tries, 3);
});

test('plan : une étape qui échoue n\'empêche pas l\'arrêt propre des suivantes', async () => {
  const ran = [];
  await assert.rejects(
    runSteps([
      { label: 'a', run: async () => ran.push('a') },
      { label: 'b', run: async () => { throw new Error('nope'); } },
      { label: 'c', run: async () => ran.push('c') },
    ], { retries: 1 })
  );
  assert.deepEqual(ran, ['a']);
});

test('plan : annulation immédiate', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(runSteps([{ label: 'x', run: async () => {} }], { signal: ac.signal }), /annulé/);
});

// ---------- combat ----------
test('combat : ne cible jamais un joueur, préfère le mob qui menace le propriétaire', () => {
  const here = new Vec3(0, 64, 0);
  const owner = new Vec3(12, 64, 0);
  const mobNearBot = { type: 'hostile', name: 'zombie', position: new Vec3(2, 64, 0) };
  const mobNearOwner = { type: 'hostile', name: 'skeleton', position: new Vec3(11, 64, 0) };
  const player = { type: 'player', name: 'Bob', position: new Vec3(1, 64, 0) };
  assert.equal(chooseTarget([mobNearBot, mobNearOwner, player], { botPos: here, ownerPos: owner }), mobNearOwner);
  assert.equal(chooseTarget([player], { botPos: here }), null);
  assert.equal(chooseTarget([mobNearBot], { botPos: here, maxDistance: 1 }), null);
  assert.equal(isHostileMob({ type: 'passive', name: 'cow' }), false);
});

test('combat : meilleure épée possédée', () => {
  assert.equal(bestSword([{ name: 'wooden_sword' }, { name: 'diamond_sword' }, { name: 'stone_sword' }]).name, 'diamond_sword');
  assert.equal(bestSword([{ name: 'dirt' }]), null);
});
