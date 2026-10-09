'use strict';
/**
 * Construction réelle d'un plan sur le serveur.
 *
 *  matériaux (fabriqués/récoltés) → ordre des blocs → pose un par un
 *  (chaque pose vérifiée) → vérification finale du plan contre le monde.
 */
const Vec3 = require('vec3');
const { FACES, orderBlocks, materialsFor, isSatisfied, verifyBlocks } = require('./blueprint');
const { runSteps } = require('./plan');
const { craftItem, countOf, goNear } = require('./crafter');
const { createLogger } = require('./logger');

const REACH = 4.5;
const RETRIES_PER_BLOCK = 3;

/**
 * Choisit comment poser un bloc en `target` : un voisin plein `ref` tel que
 * ref + face = target. Fonction pure.
 * @param {{x,y,z}} target
 * @param {(pos:{x,y,z})=>boolean} isSolid
 * @returns {{ref:{x,y,z}, face:number[]}|null}
 */
function pickFace(target, isSolid) {
  for (const [dx, dy, dz] of FACES) {
    const ref = { x: target.x - dx, y: target.y - dy, z: target.z - dz };
    if (isSolid(ref)) return { ref, face: [dx, dy, dz] };
  }
  return null;
}

/** Vrai si une matière est récoltable/fabricable par le planificateur. */
function itemInInventory(mc, name) {
  return mc.inventory.items().find((i) => i.name === name) || null;
}

/** Pose un bloc du plan. Retourne 'skip' si déjà satisfait, sinon 'placed'. */
async function placeOne(mc, block, log) {
  const target = new Vec3(block.x, block.y, block.z);
  const current = mc.blockAt(target);
  const currentName = current ? current.name : null;
  if (isSatisfied(block, currentName)) return 'skip';

  // Un bloc différent occupe la place : on le retire d'abord.
  if (currentName && currentName !== 'air') {
    if (!mc.canDigBlock(current)) throw new Error(`${currentName} en place, impossible à retirer`);
    await mc.dig(current);
    log.action(`Retiré ${currentName} en ${block.x} ${block.y} ${block.z}`);
  }

  // Ne jamais poser sous soi : on s'écarte si on est dans la cible.
  const here = mc.entity.position;
  if (Math.abs(here.x - target.x) < 1 && Math.abs(here.z - target.z) < 1 && Math.abs(here.y - target.y) < 2) {
    await goNear(mc, target.offset(2, 0, 2), 0);
  }
  if (mc.entity.position.distanceTo(target) > REACH) await goNear(mc, target, 3);

  const isSolid = (p) => {
    const b = mc.blockAt(new Vec3(p.x, p.y, p.z));
    return Boolean(b) && b.name !== 'air' && b.boundingBox === 'block';
  };
  const placement = pickFace(target, isSolid);
  if (!placement) throw new Error(`pas de support pour ${block.name} en ${block.x} ${block.y} ${block.z}`);

  const item = itemInInventory(mc, block.name);
  if (!item) throw new Error(`plus de ${block.name} dans l'inventaire`);
  await mc.equip(item, 'hand');
  const refBlock = mc.blockAt(new Vec3(placement.ref.x, placement.ref.y, placement.ref.z));
  await mc.placeBlock(refBlock, new Vec3(...placement.face));

  const placed = mc.blockAt(target);
  if (!isSatisfied(block, placed ? placed.name : null)) {
    throw new Error(`pose de ${block.name} non vérifiée (on voit ${placed ? placed.name : 'rien'})`);
  }
  return 'placed';
}

/**
 * Construit un plan. Renvoie le rapport de vérification.
 * @param {object} mc
 * @param {{planner, log?:object, signal:AbortSignal, gather:Function}} opts
 * @param {{name:string, blocks:object[]}} plan
 */
async function buildPlan(mc, opts, plan) {
  const log = opts.log || createLogger('BUILD');
  const { signal } = opts;
  const ordered = orderBlocks(plan.blocks, mc.entity.position.floored());
  const todo = ordered.filter((b) => {
    const cur = mc.blockAt(new Vec3(b.x, b.y, b.z));
    return !isSatisfied(b, cur ? cur.name : null);
  });
  log.info(`${plan.name} : ${todo.length} blocs à poser sur ${plan.blocks.length}`);

  // 1. Matériaux : fabriqués ou récoltés avant de commencer.
  for (const [name, count] of Object.entries(materialsFor(todo))) {
    if (signal.aborted) throw new Error('annulé');
    const have = countOf(mc, name);
    if (have < count) {
      log.info(`Matériaux : il faut ${count} ${name}, j'en ai ${have}`);
      await craftItem(mc, opts.planner, name, count, { log, signal, gather: opts.gather, planner: opts.planner });
    }
  }

  // 2. Pose, bloc par bloc, avec réessais bornés.
  const steps = todo.map((b) => ({
    label: `${b.name} en ${b.x} ${b.y} ${b.z}`,
    run: async () => {
      if (signal.aborted) throw new Error('annulé');
      await placeOne(mc, b, log);
    },
  }));
  await runSteps(steps, { signal, retries: RETRIES_PER_BLOCK });

  // 3. Vérification finale contre le monde réel.
  const report = verifyBlocks(plan.blocks, (p) => {
    const b = mc.blockAt(new Vec3(p.x, p.y, p.z));
    return b ? b.name : null;
  });
  if (!report.ok) {
    throw new Error(`construction incomplète : ${report.bad.length} bloc(s) faux, ${report.unknown} inconnu(s)`);
  }
  log.info(`${plan.name} : vérifié, ${report.total} blocs conformes`);
  return report;
}

module.exports = { buildPlan, pickFace, placeOne };
