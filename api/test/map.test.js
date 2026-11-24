import test from 'node:test';
import assert from 'node:assert/strict';
import { mapConfig } from '../map.js';

test('no MAP_TILE_URL ⇒ no map key, the app uses its OpenStreetMap default', () => {
  assert.equal(mapConfig({}), null);
});

test('a tile URL alone is offered with an empty attribution', () => {
  assert.deepEqual(mapConfig({ MAP_TILE_URL: 'https://tiles.example/{z}/{x}/{y}.png' }),
    { tileUrl: 'https://tiles.example/{z}/{x}/{y}.png', attribution: '' });
});

test('URL and attribution are both passed through', () => {
  assert.deepEqual(mapConfig({ MAP_TILE_URL: 'https://t/{z}/{x}/{y}.png', MAP_TILE_ATTRIBUTION: '© Mine' }),
    { tileUrl: 'https://t/{z}/{x}/{y}.png', attribution: '© Mine' });
});
