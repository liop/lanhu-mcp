import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));

test('npm bin points to an executable built entrypoint', () => {
  assert.equal(packageJson.bin?.['lanhu-mcp'], './dist/index.js');

  const entrypoint = readFileSync(resolve(rootDir, packageJson.bin['lanhu-mcp']), 'utf8');

  assert.equal(entrypoint.split('\n')[0], '#!/usr/bin/env node');
});
