import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const launcher = new URL('../Start Career Ops.command', import.meta.url);

function fixture(ready = false) {
  assert.ok(existsSync(launcher), 'macOS double-click launcher exists');
  const temp = mkdtempSync(join(tmpdir(), 'career-ops-mac-'));
  const root = join(temp, 'Проект с пробелами'); const bin = join(temp, 'bin');
  mkdirSync(join(root, 'scripts'), { recursive: true }); mkdirSync(join(root, 'web'), { recursive: true }); mkdirSync(bin);
  const script = join(root, 'Start Career Ops.command');
  writeFileSync(script, readFileSync(launcher), { mode: 0o755 });
  writeFileSync(join(root, 'package.json'), '{"dependencies":{"mock-root":"1"}}');
  writeFileSync(join(root, 'web', 'package.json'), '{"dependencies":{"mock-web":"1"}}');
  writeFileSync(join(root, 'scripts', 'ui-server.mjs'), 'import fs from "node:fs"; fs.appendFileSync(process.env.LAUNCH_TEST_LOG, "UI:" + process.cwd() + "\\n");');
  writeFileSync(join(root, 'cv.md'), 'Existing CV'); writeFileSync(join(root, 'portals.yml'), 'Existing sources');
  const log = join(temp, 'calls.log');
  writeFileSync(join(bin, 'npm'), `#!/bin/sh\nprintf 'npm:%s\\n' "$*" >> "$LAUNCH_TEST_LOG"\nif [ "\${FAIL_INSTALL:-}" = 1 ]; then exit 17; fi\ncase "$*" in\n  'install '*) mkdir -p node_modules/mock-root; echo '{}' > node_modules/mock-root/package.json ;;\n  '--prefix web ci '*) mkdir -p web/node_modules/mock-web; echo '{}' > web/node_modules/mock-web/package.json ;;\nesac\n`, { mode: 0o755 });
  if (ready) for (const path of ['node_modules/mock-root', 'web/node_modules/mock-web']) { mkdirSync(join(root,path), { recursive: true }); writeFileSync(join(root,path,'package.json'),'{}'); }
  const run = more => spawnSync('/bin/bash', [script], { cwd: tmpdir(), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LAUNCH_TEST_LOG: log, ...more } });
  return { root, run, calls: () => existsSync(log) ? readFileSync(log,'utf8').trim().split('\n') : [], clean: () => rmSync(temp, { recursive: true, force: true }) };
}

test('macOS first launch installs missing dependencies and starts existing UI from a path with spaces', { skip: process.platform === 'win32' }, () => {
  const f = fixture();
  try {
    const result = f.run(); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(f.calls(), ['npm:install --ignore-scripts --package-lock=false', 'npm:--prefix web ci --ignore-scripts', `UI:${f.root}`]);
    assert.equal(readFileSync(join(f.root,'cv.md'),'utf8'),'Existing CV');
    assert.equal(readFileSync(join(f.root,'portals.yml'),'utf8'),'Existing sources');
  } finally { f.clean(); }
});
test('macOS repeated launch starts without reinstalling dependencies', { skip: process.platform === 'win32' }, () => {
  const f = fixture(true);
  try { const result = f.run(); assert.equal(result.status,0,result.stderr); assert.deepEqual(f.calls(),[`UI:${f.root}`]); }
  finally { f.clean(); }
});
test('macOS dependency installation failure stops before launching the app', { skip: process.platform === 'win32' }, () => {
  const f = fixture();
  try { const result = f.run({ FAIL_INSTALL:'1' }); assert.equal(result.status,17); assert.deepEqual(f.calls(),['npm:install --ignore-scripts --package-lock=false']); }
  finally { f.clean(); }
});
