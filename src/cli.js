'use strict';
/**
 * CLI de contrôle : lit les commandes sur stdin.
 *   !status, !stop, !resume, !goto x y z, ...   (commandes complètes)
 *   status, stop, reconnect, quit, help          (raccourcis sans "!")
 *   say <message>                                (parle dans le chat)
 */
const readline = require('readline');
const { createLogger } = require('./core/logger');
const { ROLES } = require('./core/permissions');

const log = createLogger('CLI');
/**
 * Transforme une ligne saisie en message de commande ou null.
 * @param {string} line
 * @param {Set<string>} names  noms et alias des commandes enregistrées
 */
function toCommandLine(line, names) {
  const text = line.trim();
  if (!text) return null;
  if (text.startsWith('!')) return text;
  const first = text.split(/\s+/)[0].toLowerCase();
  if (names.has(first)) return '!' + text;
  return null;
}

/** Noms et alias de toutes les commandes du registre. */
function commandNames(registry) {
  return new Set(registry.commands.keys());
}

function startCli(jarvis) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  if (process.stdin.isTTY) rl.setPrompt('jarvis> ');
  rl.on('line', async (line) => {
    const text = line.trim();
    if (text.toLowerCase().startsWith('say ')) {
      jarvis.say(text.slice(4));
      return;
    }
    const command = toCommandLine(text, commandNames(jarvis.commands));
    if (!command) {
      if (text) log.info('Commande inconnue. Tapez "help".');
      return;
    }
    const ctx = {
      username: 'console',
      role: ROLES.CONSOLE,
      bot: jarvis.mc,
      connected: jarvis.connected,
      jarvis,
      services: jarvis.services,
      paused: jarvis.paused,
    };
    const result = await jarvis.commands.execute(command, ctx);
    if (result.reply) log.info(result.reply);
  });
  // Pas de fermeture du process si stdin se ferme (ex: lancé en arrière-plan).
  rl.on('close', () => log.debug('stdin fermé — le bot continue de tourner'));
  if (process.stdin.isTTY) rl.prompt();
  return rl;
}

module.exports = { startCli, toCommandLine, commandNames };
