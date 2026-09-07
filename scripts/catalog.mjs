import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {validateManifest} from '../shared/manifest.mjs';
const approved=JSON.parse(await readFile('catalog/apps.json','utf8')).map(validateManifest);
let files=[];try{files=await readdir('submissions');}catch{}
for(const name of files.filter(f=>f.endsWith('.json'))){
 const item=validateManifest(JSON.parse(await readFile(`submissions/${name}`,'utf8')));
 // Inclusion is explicit: a trusted maintainer must create a matching approval record.
 try{
  const review=JSON.parse(await readFile(`reviews/${item.id}-${item.sha256}.json`,'utf8'));
  if(review.decision!=='approve'||review.sha256!==item.sha256||review.manifestSha256!==createHash('sha256').update(JSON.stringify(item)).digest('hex')||!review.aiRunUrl||!review.inspectionRunUrl||!review.reviewedBy)continue;
  const index=approved.findIndex(a=>a.id===item.id);if(index<0)approved.push(item);else approved[index]=item;
 }catch{console.log(`Pending review: ${item.id}`);}
}
if(new Set(approved.map(a=>a.id)).size!==approved.length)throw Error('Duplicate app IDs.');
await mkdir('catalog',{recursive:true});await writeFile('catalog/apps.json',JSON.stringify(approved.sort((a,b)=>a.name.localeCompare(b.name)),null,2)+'\n');
console.log(`${approved.length} approved app(s).`);

