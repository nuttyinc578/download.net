import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validateManifest} from '../shared/manifest.mjs';
test('catalog keeps submissions pending and requires fresh approval after a listing changes',async t=>{
 const root=await mkdtemp(join(tmpdir(),'nutty-catalog-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const name of ['catalog','submissions','reviews'])await mkdir(join(root,name));
 await writeFile(join(root,'catalog/apps.json'),'[]');
 const app=validateManifest({id:'example-app',name:'Example app',description:'Reviewed description',kind:'app',version:'1.0',publisher:'tester',url:'https://github.com/tester/releases/releases/download/v1/example.vfdn',sha256:'a'.repeat(64),size:100,license:'MIT'});
 const submission=join(root,'submissions/example-app.json');await writeFile(submission,JSON.stringify(app));
 const run=()=>execFileSync(process.execPath,[resolve('scripts/catalog.mjs')],{cwd:root,encoding:'utf8',windowsHide:true});
 const catalog=async()=>JSON.parse(await readFile(join(root,'catalog/apps.json'),'utf8'));
 run();assert.deepEqual(await catalog(),[]);
 const review={decision:'approve',sha256:app.sha256,manifestSha256:createHash('sha256').update(JSON.stringify(app)).digest('hex'),reviewedBy:'maintainer',aiRunUrl:'https://github.com/nuttyinc578/download.net/actions/runs/1',inspectionRunUrl:'https://github.com/nuttyinc578/download.net/actions/runs/1'};
 await writeFile(join(root,'reviews/example-app-'+app.sha256+'.json'),JSON.stringify(review));
 run();assert.equal((await catalog())[0].description,'Reviewed description');
 await writeFile(submission,JSON.stringify({...app,description:'Unreviewed replacement'}));
 run();assert.equal((await catalog())[0].description,'Reviewed description');
});

