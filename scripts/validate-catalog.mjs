import {readFile,readdir} from 'node:fs/promises';
import {validateManifest} from '../shared/manifest.mjs';
const apps=JSON.parse(await readFile('catalog/apps.json','utf8')).map(validateManifest);
if(new Set(apps.map(a=>a.id)).size!==apps.length)throw Error('Duplicate app IDs in catalog.');
const {readSubmissions}=await import('../shared/submissions.mjs');
const submissions=await readSubmissions();
console.log('Validated '+apps.length+' catalog listing(s) and '+submissions.length+' submission(s).');
