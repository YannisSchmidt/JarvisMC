'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveVersion, listSupportedVersions } = require('../../src/adapters/version');

test('1.21.11 est résolue avec un protocole', () => {
  const p = resolveVersion('1.21.11');
  assert.equal(p.minecraftVersion, '1.21.11');
  assert.equal(typeof p.protocolVersion, 'number');
  assert.equal(p.family, '1.21');
});

test('les pré-versions et snapshots sont refusées avec suggestions', () => {
  assert.throws(() => resolveVersion('1.21.11-rc1'), /non prise en charge/);
  assert.throws(() => resolveVersion('9.99'), /Versions récentes disponibles : /);
});

test('la liste ne contient pas de pré-version', () => {
  const list = listSupportedVersions();
  assert.ok(list.includes('1.21.11'));
  assert.ok(list.includes('26.1'), 'les versions 26.x sont listées');
  assert.ok(list.every((v) => !/-(pre|rc)/.test(v)));
});
