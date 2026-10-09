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
const SHORTCUTS = new Set(['help', 'status', 'task', 'inventory', 'stop', 'resume', 'cancel', 'reconnect', 'quit', 'goto', 'follow']);

/** Transforme une ligne saisie en message de commande ou null. */
function toCommandLine(line) {
  const text = line.trim();
  if (!text) return null;
  if (text.startsWith('!')) return text;
  const first = text.split(/\s+/)[0].toLowerCase();
  if (SHORTCUTS.has(first)) return '!' + text;
  return null;
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
    const command = toCommandLine(text);
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

module.exports = { startCli, toCommandLine };
