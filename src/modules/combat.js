'use strict';
/**
 * Module COMBAT — défense automatique contre les mobs hostiles.
 *
 *  - ne cible JAMAIS un joueur ;
 *  - priorise un mob qui s'approche du propriétaire (défense du propriétaire) ;
 *  - fuit quand les PV sont bas au lieu de rester bloqué ;
 *  - peut être activé/désactivé (!defend on|off).
 */
const { goals: { GoalNear, GoalFollow } } = require('mineflayer-pathfinder');
const { ARMOR_RANK } = require('../core/crafter');

const TICK_MS = 500;
const ATTACK_COOLDOWN_MS = 600;
const ENGAGE_RANGE = 3.2;
const ENGAGE_MAX = 12;
const FLEE_HEALTH = 6;
const FLEE_DISTANCE = 14;

/** Mob hostile (pas un joueur, pas un animal). */
function isHostileMob(entity) {
  return Boolean(entity) && entity.type === 'hostile' && entity.name !== 'player';
}

/**
 * Choisit la cible : mob proche du propriétaire d'abord, sinon le plus proche du bot.
 * Fonction pure : positions en paramètres.
 * @returns {object|null} entité choisie
 */
function chooseTarget(entities, { botPos, ownerPos = null, maxDistance = ENGAGE_MAX }) {
  let best = null;
  for (const e of entities) {
    if (!isHostileMob(e) || !e.position) continue;
    const d = e.position.distanceTo(botPos);
    if (d > maxDistance) continue;
    const ownerD = ownerPos ? e.position.distanceTo(ownerPos) : Infinity;
    const threatensOwner = ownerD <= 4 ? 0 : 1;
    const score = [threatensOwner, d];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) {
      best = { entity: e, score };
    }
  }
  return best ? best.entity : null;
}

/** Meilleure épée possédée (ou null). */
function bestSword(items) {
  const swords = items.filter((i) => i.name.endsWith('_sword'));
  swords.sort((a, b) => ARMOR_RANK.indexOf(b.name.split('_')[0]) - ARMOR_RANK.indexOf(a.name.split('_')[0]));
  return swords[0] || null;
}

function createCombatModule() {
  return {
    name: 'combat',

    attach(mc, services) {
      const { config, tasks, say, log: baseLog } = services;
      const log = baseLog;
      let busy = false;
      let lastAttack = 0;
      let lastFleeAlert = 0;
      let combatGoal = false;

      const timer = setInterval(async () => {
        if (busy || !mc.entity || !services.state.defend) return;
        busy = true;
        try {
          await tick();
        } catch (err) {
          log.warn(`Combat : ${err.message}`);
        } finally {
          busy = false;
        }
      }, TICK_MS);

      async function tick() {
        const entities = Object.values(mc.entities);
        const here = mc.entity.position;
        const ownerEntity = config.behavior.owner && mc.players[config.behavior.owner]
          ? mc.players[config.behavior.owner].entity
          : null;
        const ownerPos = ownerEntity ? ownerEntity.position : null;
        const target = chooseTarget(entities, { botPos: here, ownerPos });

        // Fuite : PV bas + ennemi proche → on arrête tout et on s'éloigne.
        if (mc.health <= FLEE_HEALTH && target) {
          if (Date.now() - lastFleeAlert > 10000) {
            lastFleeAlert = Date.now();
            say(`PV bas (${Math.round(mc.health)}), je fuis !`);
          }
          tasks.cancel('fuite');
          const dx = here.x - target.position.x;
          const dz = here.z - target.position.z;
          const len = Math.hypot(dx, dz) || 1;
          const goal = new GoalNear(
            Math.floor(here.x + (dx / len) * FLEE_DISTANCE),
            Math.floor(here.y),
            Math.floor(here.z + (dz / len) * FLEE_DISTANCE),
            2
          );
          mc.pathfinder.setGoal(goal);
          combatGoal = true;
          return;
        }

        if (!target) {
          if (combatGoal) {
            mc.pathfinder.setGoal(null);
            combatGoal = false;
          }
          return;
        }

        const dist = target.position.distanceTo(here);
        if (dist > ENGAGE_RANGE) {
          // Pas de tâche en cours : on s'approche. Sinon on laisse la tâche continuer.
          if (!tasks.describe().active) {
            mc.pathfinder.setGoal(new GoalFollow(target, 2), true);
            combatGoal = true;
          }
          return;
        }

        if (combatGoal) {
          mc.pathfinder.setGoal(null);
          combatGoal = false;
        }
        const sword = bestSword(mc.inventory.items());
        if (sword && (!mc.heldItem || mc.heldItem.name !== sword.name)) await mc.equip(sword, 'hand');
        await mc.lookAt(target.position.offset(0, target.height || 1, 0));
        if (Date.now() - lastAttack >= ATTACK_COOLDOWN_MS) {
          lastAttack = Date.now();
          mc.attack(target);
          log.action(`Attaque ${target.name || target.displayName || 'mob'}`);
        }
      }

      return () => {
        clearInterval(timer);
        if (combatGoal && mc.pathfinder) mc.pathfinder.setGoal(null);
      };
    },

    commands: [
      {
        name: 'defend',
        aliases: ['defends', 'defense'],
        minRole: 'TRUSTED',
        usage: '!defend on|off',
        description: 'Active ou désactive la défense automatique',
        run(ctx, args) {
          const arg = (args[0] || '').toLowerCase();
          if (arg === 'on') ctx.services.state.defend = true;
          else if (arg === 'off') ctx.services.state.defend = false;
          else if (arg) return 'Usage : !defend on|off';
          return `Défense : ${ctx.services.state.defend ? 'activée' : 'désactivée'}`;
        },
      },
    ],
  };
}

module.exports = { createCombatModule, chooseTarget, isHostileMob, bestSword };
