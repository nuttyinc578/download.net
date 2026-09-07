import * as asar from '@electron/asar';
import {readFileSync} from 'node:fs';
const archive='artifacts/win-unpacked/resources/app.asar';
const files=['desktop/main.cjs','desktop/preload.cjs','desktop/download.mjs','desktop/publish.mjs','shared/manifest.mjs','shared/folder-package.mjs','scripts/vfdn.mjs','vfdn.ps1','vnedfordownloaddotnet.cmd','web/store.html','web/store.js','web/style.css','web/flow.js','web/index.html','web/landing.js','web/license.html','web/conduct.html','web/contributing.html'];
for(const path of files){const packaged=asar.extractFile(archive,path);const source=readFileSync(path);if(!Buffer.from(packaged).equals(source))throw Error('Packaged file differs from source: '+path);}
console.log('PASS: '+files.length+' packaged launcher files match the current source.');

