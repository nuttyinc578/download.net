const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const folder = path.resolve(process.argv[2] || 'artifacts/win-unpacked');
const archive = path.join(folder, 'resources/app.asar');
const extract = name => asar.extractFile(archive, path.normalize(name));
const expected = require('../package.json');
const packaged = JSON.parse(extract('package.json'));
assert.equal(packaged.version, expected.version);
for (const dir of ['desktop', 'shared', 'web']) {
  for (const file of fs.readdirSync(dir, {recursive: true})) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isFile()) assert.deepEqual(extract(name.replaceAll('\\', '/')), fs.readFileSync(name), name);
  }
}
assert.deepEqual(extract('CODE_OF_CONDUCT.md'), fs.readFileSync('CODE_OF_CONDUCT.md'));
for(const name of ['scripts/vfdn.mjs','vfdn.ps1','vfdn.cmd','vnedfordownloaddotnet.cmd'])assert.deepEqual(extract(name),fs.readFileSync(name),name);
const updaterConfig=require('js-yaml').load(fs.readFileSync(path.join(folder,'resources/app-update.yml'),'utf8'));
assert.equal(updaterConfig.provider,'github');assert.equal(updaterConfig.owner,'nuttyinc578');assert.equal(updaterConfig.repo,'download.net');
assert.ok(extract('node_modules/electron-updater/out/main.js').length>0);
const ui = extract('web/store.html').toString();
assert.ok(!ui.includes('Save connection'));
assert.ok(ui.includes('Choose folder'));
assert.ok(ui.includes('id="updates-view"'));assert.ok(ui.includes('id="install-update"'));
assert.ok(ui.includes('signup-conduct-accepted'));
assert.ok(ui.includes('Contributor Covenant 2.1'));
for (const name of ['runtime/api/Api.exe', 'runtime/api/Api.dll', 'runtime/bootstrap/nuttyinc-bootstrap.exe']) assert.ok(fs.statSync(path.join(folder, 'resources', name)).size > 0, name);
console.log(`PASS: packaged launcher ${packaged.version} contains current source and the automatic backend.`);
