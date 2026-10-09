'use strict';
/**
 * Module SURVIVAL — manger quand la faim est basse, signaler les PV bas,
 * dormir la nuit si un lit est proche (best effort), journaliser la mort.
 * Le respawn automatique est géré par Mineflayer (option `respawn`).
 */
const { goals: { GoalNear } } = require('mineflayer-pathfinder');

const EAT_BELOW_FOOD = 16;
const ALERT_COOLDOWN_MS = 30 * 1000;
const SLEEP_CHECK_MS = 10 * 1000;
const BED_SEARCH_DISTANCE = 24;
const NIGHT_START = 12541;
const NIGHT_END = 23458;

function createSurvivalModule() {
  return {
    name: 'survival',

    attach(mc, services) {
      const { config, log, say, tasks } = services;
      const { behavior } = config;
      const cleanups = [];
      let eating = false;
      let lastAlert = 0;

      async function eatIfHungry() {
        if (eating || !behavior.autoEat || mc.food >= EAT_BELOW_FOOD) return;
        const food = mc.inventory.items().find((item) => mc.registry.foods[item.type]);
        if (!food) return;
        eating = true;
        try {
          await mc.equip(food, 'hand');
          await mc.consume();
          log.action(`A mangé ${food.name} (faim ${mc.food}/20)`);
        } catch (err) {
          log.warn(`Impossible de manger : ${err.message}`);
        } finally {
          eating = false;
        }
      }

      function onHealth() {
        if (mc.health <= behavior.lowHealthAlert && Date.now() - lastAlert > ALERT_COOLDOWN_MS) {
          lastAlert = Date.now();
          log.warn(`PV bas : ${mc.health}/20`);
          say(`Attention, je n'ai plus que ${Math.round(mc.health)} PV !`);
        }
        eatIfHungry();
      }

      function onDeath() {
        log.warn('Je suis mort.');
        say("Je suis mort, je reviens à l'apparition.");
      }

      mc.on('health', onHealth);
      mc.on('death', onDeath);
      cleanups.push(() => mc.removeListener('health', onHealth));
      cleanups.push(() => mc.removeListener('death', onDeath));

      if (behavior.autoSleep) {
        const timer = setInterval(() => trySleep(), SLEEP_CHECK_MS);
        cleanups.push(() => clearInterval(timer));
      }

      function isNight() {
        const t = mc.time && mc.time.timeOfDay;
        return typeof t === 'number' && t >= NIGHT_START && t <= NIGHT_END;
      }

      function hostilesNear() {
        return Object.values(mc.entities).some(
          (e) => e && e.type === 'hostile' && e.position && mc.entity.position.distanceTo(e.position) < 16
        );
      }

      function trySleep() {
        if (mc.isSleeping || tasks.describe().active || !isNight() || hostilesNear()) return;
        const bed = mc.findBlock({ matching: (b) => mc.isABed(b), maxDistance: BED_SEARCH_DISTANCE });
        if (!bed) return;
        tasks.start('dormir', async () => {
          await mc.pathfinder.goto(new GoalNear(bed.position.x, bed.position.y, bed.position.z, 1));
          await mc.sleep(bed);
          log.action('Je dors.');
        }).catch((err) => log.warn(`Sommeil : ${err.message}`));
      }

      return () => cleanups.forEach((fn) => fn());
    },

    commands: [],
  };
}

module.exports = { createSurvivalModule };
