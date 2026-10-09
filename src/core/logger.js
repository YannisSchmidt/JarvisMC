'use strict';
/**
 * Logger structuré : [HH:MM:SS] [TAG] message
 * Niveaux : ERROR, WARN, INFO, DEBUG. Les catégories AI et ACTION sont
 * affichées au niveau INFO.
 */
const fs = require('fs');
const path = require('path');

const RANK = { ERROR: 0, WARN: 1, INFO: 2, AI: 2, ACTION: 2, DEBUG: 3 };

const state = { level: 'INFO', stream: null };

function configureLogger({ level = 'INFO', file = null } = {}) {
  const upper = String(level).toUpperCase();
  state.level = RANK[upper] === undefined ? 'INFO' : upper;
  if (state.stream) state.stream.end();
  state.stream = null;
  if (file) {
    const abs = path.resolve(file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    state.stream = fs.createWriteStream(abs, { flags: 'a' });
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestamp(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function write(level, tag, message) {
  if (RANK[level] > RANK[state.level]) return;
  const prefix = level === 'ERROR' || level === 'WARN' ? `[${level}] ` : '';
  const line = `[${timestamp()}] ${prefix}[${tag}] ${message}`;
  if (level === 'ERROR' || level === 'WARN') console.error(line);
  else console.log(line);
  if (state.stream) state.stream.write(line + '\n');
}

/** Crée un logger pour un module donné, ex: createLogger('MINING'). */
function createLogger(tag) {
  return {
    error: (msg) => write('ERROR', tag, msg),
    warn: (msg) => write('WARN', tag, msg),
    info: (msg) => write('INFO', tag, msg),
    ai: (msg) => write('AI', tag, msg),
    action: (msg) => write('ACTION', tag, msg),
    debug: (msg) => write('DEBUG', tag, msg),
  };
}

module.exports = { configureLogger, createLogger, timestamp };
