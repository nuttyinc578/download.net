import {readFile,writeFile,mkdir,rename,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readSubmissions} from '../shared/submissions.mjs';
import {validateManifest} from '../shared/manifest.mjs';
export async function publishCatalog({root=process.cwd(),verify,order}={}){
 const file=join(root,'catalog/apps.json');
 const approved=JSON.parse(await readFile(file,'utf8')).map(validateManifest);
 if(new Set(approved.map(a=>a.id)).size!==approved.length)throw Error('Duplicate app IDs.');
 const entries=await readSubmissions(root);
 if(!order){const log=execFileSync('git',['log','--reverse','--format=','--name-only','--','submissions','catalog/submissions'],{cwd:root,encoding:'utf8',windowsHide:true});order=new Map(log.split(/\r?\n/).filter(Boolean).map((path,i)=>[path,i]));}
 // The most recently merged/updated manifest wins, even when filenames sort differently.
 entries.sort((a,b)=>(order.get(a.path)??-1)-(order.get(b.path)??-1)||a.path.localeCompare(b.path));
 const latest=new Map();for(const entry of entries)latest.set(entry.manifest.id,entry.manifest);
 await mkdir(join(root,'artifacts'),{recursive:true});
 const temporary=await mkdtemp(join(root,'artifacts','catalog-review-'));
 try{
  for(const item of latest.values()){
   const index=approved.findIndex(a=>a.id===item.id);
   if(index>=0&&JSON.stringify(approved[index])===JSON.stringify(item))continue;
   console.log('Verifying merged submission: '+item.name+' '+item.version);
   if(verify)await verify(item);
   else {
    const input=join(temporary,'submission.json');await writeFile(input,JSON.stringify(item));
    execFileSync(process.execPath,[resolve(root,'scripts/inspect-submission.mjs'),input],{cwd:root,stdio:'inherit',windowsHide:true,timeout:20*60*1000});
    if(process.env.MODERATION_URL||process.env.MODERATION_KEY)execFileSync(process.execPath,[resolve(root,'scripts/moderate.mjs'),input],{cwd:root,stdio:'inherit',windowsHide:true,timeout:120000});
    else console.log('AI provider not configured; publication uses maintainer merge approval and package verification.');
   }
   if(index<0)approved.push(item);else approved[index]=item;
  }
  const result=approved.sort((a,b)=>a.name.localeCompare(b.name));
  await writeFile(file+'.tmp',JSON.stringify(result,null,2)+'\n');await rename(file+'.tmp',file);
  console.log(result.length+' verified app(s) in the catalog.');return result;
 }finally{await rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)publishCatalog().catch(e=>{console.error(e.message);process.exitCode=1;});
