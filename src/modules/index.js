'use strict';
/**
 * Registre des modules. Ajouter une capacité = créer un fichier dans src/modules/
 * qui exporte une fabrique, puis l'ajouter ici. Aucun autre code à modifier.
 */
const { createMovementModule } = require('./movement');
const { createInventoryModule } = require('./inventory');
const { createSurvivalModule } = require('./survival');
const { createGeneralModule } = require('./general');

function createModules() {
  return [createGeneralModule(), createMovementModule(), createInventoryModule(), createSurvivalModule()];
}

module.exports = { createModules };
