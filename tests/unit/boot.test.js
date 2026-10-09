'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { boot } = require('../../src/core/boot');
const { parseArgs } = require('../../src/index');

function writeCfg(obj) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-boot-'));
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

test('boot prépare modules et profil de version avant connexion', () => {
  const prepared = boot({
    configPath: writeCfg({ bot: { version: '1.21.1' }, logging: { level: 'ERROR', file: null } }),
  });
  assert.equal(prepared.versionProfile.minecraftVersion, '1.21.1');
  const names = prepared.modules.map((m) => m.name);
  for (const expected of ['general', 'movement', 'inventory', 'survival']) assert.ok(names.includes(expected));
});

test('boot échoue proprement sur une version non supportée', () => {
  assert.throws(
    () => boot({ configPath: writeCfg({ bot: { version: '9.99' }, logging: { file: null } }) }),
    /non prise en charge/
  );
});

test('parseArgs lit --config', () => {
  assert.equal(parseArgs(['--config', 'x.json']).configPath, path.resolve('x.json'));
  assert.equal(parseArgs([]).configPath, null);
});
