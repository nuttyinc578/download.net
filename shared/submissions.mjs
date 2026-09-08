import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validateManifest} from './manifest.mjs';
export async function readSubmissions(root='.'){
 const entries=[];
 for(const dir of ['submissions','catalog/submissions']){
  let names;try{names=await readdir(join(root,dir));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  for(const name of names.filter(n=>n.endsWith('.json')).sort()){
   if(!/^[a-z0-9-]+\.json$/.test(name))throw Error('Invalid submission filename: '+name);
   const path=dir+'/'+name;entries.push({path,manifest:validateManifest(JSON.parse(await readFile(join(root,path),'utf8')))});
  }
 }
 return entries;
}
