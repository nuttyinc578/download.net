import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';

if(process.env.VNED_RUNTIME){
 const output=execFileSync(process.env.PYTHON||'python',[process.env.VNED_RUNTIME,'vned/launcher.vned'],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'},timeout:10000});
 const flow=JSON.parse(output.trim());
 if(flow.protocol!==1||['bootstrap','verification','aspire','downloading','installing','complete'].some(k=>typeof flow.labels[k]!=='string'))throw Error('Invalid Vned flow output.');
 await writeFile('web/flow.js',`// Compiled from vned/launcher.vned using the upstream Python Vned runtime.\nwindow.nuttyFlow = ${JSON.stringify(flow,null,2)};\n`);
 console.log('Compiled the Vned launcher flow.');
}else{await readFile('web/flow.js');console.log('Using the committed Vned-compiled flow. Set VNED_RUNTIME to recompile.');}
const source=await readFile('web/store.js','utf8');
const start=source.indexOf('const policies=')+'const policies='.length;
const end=source.indexOf('\nlet policyKey',start);
const policy=vm.runInNewContext('('+source.slice(start,end).trim().replace(/;$/,'')+')',{}, {timeout:1000});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
for(const [key,value] of Object.entries(policy)){
 const content=value.body.map(p=>`<p>${escape(p)}</p>`).join('\n');
 await writeFile(`web/${key}.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(value.title)} — download.net</title><link rel="stylesheet" href="style.css"><link rel="icon" href="favicon.svg"></head><body><header class="topbar"><a class="brand" href="index.html"><span class="brand-mark">↓</span>download.net</a><a class="button small" href="store.html">Open store ↗</a></header><main class="legal"><h1>${escape(value.title)}</h1>${content}<a href="index.html" class="button">← Back to download.net</a></main></body></html>`);
 if(key!=='license')await writeFile(key==='conduct'?'CODE_OF_CONDUCT.md':'CONTRIBUTING.md',`# ${value.title}\n\n${value.body.join('\n\n')}\n`);
}
await mkdir('dist/site',{recursive:true});await cp('web','dist/site',{recursive:true});
console.log('Website and community documents built in dist/site.');
