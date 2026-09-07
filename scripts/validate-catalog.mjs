import {readFile,readdir} from 'node:fs/promises';
import {validateManifest} from '../shared/manifest.mjs';
const apps=JSON.parse(await readFile('catalog/apps.json','utf8')).map(validateManifest);
if(new Set(apps.map(a=>a.id)).size!==apps.length)throw Error('Duplicate app IDs in catalog.');
let submissions=[];try{submissions=await readdir('submissions');}catch{}
for(const name of submissions.filter(f=>f.endsWith('.json')))validateManifest(JSON.parse(await readFile(`submissions/${name}`,'utf8')));
console.log(`Validated ${apps.length} approved listing(s) and ${submissions.length} submission file(s).`);
