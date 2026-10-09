'use strict';
/**
 * Registre des modules. Ajouter une capacité = créer un fichier dans src/modules/
 * qui exporte une fabrique, puis l'ajouter ici. Aucun autre code à modifier.
 */
const { createMovementModule } = require('./movement');
const { createInventoryModule } = require('./inventory');
const { createSurvivalModule } = require('./survival');
const { createGeneralModule } = require('./general');
const { createGatheringModule } = require('./gathering');
const { createCraftingModule } = require('./crafting');
const { createCombatModule } = require('./combat');
const { createExplorationModule } = require('./exploration');

/** L'ordre compte : gathering doit s'attacher avant crafting (services.gather). */
function createModules() {
  return [
    createGeneralModule(),
    createMovementModule(),
    createInventoryModule(),
    createSurvivalModule(),
    createGatheringModule(),
    createCraftingModule(),
    createCombatModule(),
    createExplorationModule(),
  ];
}

module.exports = { createModules };
