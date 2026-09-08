import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {renderConduct} from './conduct-source.mjs';

if(process.env.VNED_RUNTIME){
 const output=execFileSync(process.env.PYTHON||'python',[process.env.VNED_RUNTIME,'vned/launcher.vned'],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'},timeout:10000});
 const flow=JSON.parse(output.trim());
 if(flow.protocol!==1||['bootstrap','verification','aspire','downloading','installing','complete'].some(k=>typeof flow.labels[k]!=='string'))throw Error('Invalid Vned flow output.');
 await writeFile('web/flow.js',`// Compiled from vned/launcher.vned using the upstream Python Vned runtime.\nwindow.nuttyFlow = ${JSON.stringify(flow,null,2)};\n`);
 console.log('Compiled the Vned launcher flow.');
}else{await readFile('web/flow.js');console.log('Using the committed Vned-compiled flow. Set VNED_RUNTIME to recompile.');}
const conductMarkdown=(await readFile('CODE_OF_CONDUCT.md','utf8')).replace(/^\uFEFF/,'').replaceAll('\r\n','\n').trimEnd()+'\n';
if(!conductMarkdown.includes('version 2.1')||/\[INSERT |\[NOTE:/.test(conductMarkdown))throw Error('The covenant is incomplete or has the wrong version.');
const conductMeta={version:'2.1',sha256:createHash('sha256').update(conductMarkdown).digest('hex'),sourceUrl:'https://www.contributor-covenant.org/version/2/1/code_of_conduct/'};
const conduct={...conductMeta,title:'Contributor Covenant 2.1',html:renderConduct(conductMarkdown)};
await writeFile('web/conduct.json',JSON.stringify(conductMeta,null,2)+'\n');
await writeFile('web/conduct.js','// Generated from CODE_OF_CONDUCT.md. Covenant text: CC BY 4.0.\nwindow.nuttyConduct = '+JSON.stringify(conduct,null,2)+';\n');
await writeFile('services/Api/ConductPolicy.g.cs','// Generated from CODE_OF_CONDUCT.md by build:web.\ninternal static class ConductPolicy { public const string Version = "'+conductMeta.version+'"; public const string Sha256 = "'+conductMeta.sha256+'"; }\n');
const source=await readFile('web/store.js','utf8');
const start=source.indexOf('const policies=')+'const policies='.length;
const end=source.indexOf('\nlet policyKey',start);
const policy=vm.runInNewContext('('+source.slice(start,end).trim().replace(/;$/,'')+')',{window:{nuttyConduct:conduct}}, {timeout:1000});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
for(const [key,value] of Object.entries(policy)){
 const content=value.html||value.body.map(p=>`<p>${escape(p)}</p>`).join('\n');
 await writeFile(`web/${key}.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(value.title)} — download.net</title><link rel="stylesheet" href="style.css"><link rel="icon" href="favicon.svg"></head><body><header class="topbar"><a class="brand" href="index.html"><span class="brand-mark">↓</span>download.net</a><a class="button small" href="store.html">Open store ↗</a></header><main class="legal"><h1>${escape(value.title)}</h1>${content}<a href="index.html" class="button">← Back to download.net</a></main></body></html>`);
 if(key==='contributing')await writeFile('CONTRIBUTING.md',`# ${value.title}\n\n${value.body.join('\n\n')}\n`);
}
await mkdir('dist/site',{recursive:true});await cp('web','dist/site',{recursive:true});
console.log('Website and community documents built in dist/site.');
