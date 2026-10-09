'use strict';
/**
 * Exécuteur de plan : enchaîne des étapes, vérifie chacune, réessaie avec limite.
 * Une étape est { label, run(signal) } ; `run` doit lever une erreur si son résultat
 * n'est pas vérifié. Après MAX_RETRIES échecs, le plan s'arrête (pas de boucle infinie).
 */
const MAX_RETRIES = 3;

class PlanError extends Error {
  constructor(message, step) {
    super(message);
    this.name = 'PlanError';
    this.step = step;
  }
}

/**
 * @param {Array<{label:string, run:(signal:AbortSignal)=>Promise<void>|void}>} steps
 * @param {{signal?:AbortSignal, log?:object, retries?:number}} opts
 */
async function runSteps(steps, { signal = new AbortController().signal, log = null, retries = MAX_RETRIES } = {}) {
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      if (signal.aborted) throw new PlanError('annulé', step.label);
      try {
        if (log) log.info(`Étape ${i + 1}/${steps.length} : ${step.label}${attempt > 1 ? ` (essai ${attempt})` : ''}`);
        await step.run(signal);
        lastError = null;
        break;
      } catch (err) {
        if (signal.aborted) throw new PlanError('annulé', step.label);
        lastError = err;
        if (log) log.warn(`Échec « ${step.label} » : ${err.message}`);
      }
    }
    if (lastError) throw new PlanError(`${step.label} : ${lastError.message}`, step.label);
    if (log) log.info(`Progression : ${i + 1}/${steps.length}`);
  }
}

module.exports = { runSteps, PlanError, MAX_RETRIES };
