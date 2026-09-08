const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const folder = path.resolve(process.argv[2] || 'artifacts/win-unpacked');
const archive = path.join(folder, 'resources/app.asar');
const expected = require('../package.json');
const packaged = JSON.parse(asar.extractFile(archive, 'package.json'));
assert.equal(packaged.version, expected.version);
for (const dir of ['desktop', 'shared', 'web']) {
  for (const file of fs.readdirSync(dir, {recursive: true})) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isFile()) assert.deepEqual(asar.extractFile(archive, name.replaceAll('\\', '/')), fs.readFileSync(name), name);
  }
}
assert.deepEqual(asar.extractFile(archive, 'CODE_OF_CONDUCT.md'), fs.readFileSync('CODE_OF_CONDUCT.md'));
for(const name of ['scripts/vfdn.mjs','vfdn.ps1','vfdn.cmd','vnedfordownloaddotnet.cmd'])assert.deepEqual(asar.extractFile(archive,name),fs.readFileSync(name),name);
const ui = asar.extractFile(archive, 'web/store.html').toString();
assert.ok(!ui.includes('Save connection'));
assert.ok(ui.includes('Choose folder'));
assert.ok(ui.includes('signup-conduct-accepted'));
assert.ok(ui.includes('Contributor Covenant 2.1'));
for (const name of ['runtime/api/Api.exe', 'runtime/api/Api.dll', 'runtime/bootstrap/nuttyinc-bootstrap.exe']) assert.ok(fs.statSync(path.join(folder, 'resources', name)).size > 0, name);
console.log(`PASS: packaged launcher ${packaged.version} contains current source and the automatic backend.`);
