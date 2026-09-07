import {readFile,rm,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {downloadVerified} from '../desktop/download.mjs';
import {validateManifest} from '../shared/manifest.mjs';
const manifest=validateManifest(JSON.parse(await readFile(process.argv[2],'utf8')));
await mkdir('artifacts/inspection',{recursive:true});
const path=await downloadVerified(manifest,'artifacts/inspection',{signal:AbortSignal.timeout(15*60*1000)});
try { execFileSync(process.env.JAVA||'java',['-cp','services/inspector/build','ExeInspector',path,manifest.sha256],{stdio:'inherit',timeout:120000}); }
finally { await rm(path,{force:true}); }
