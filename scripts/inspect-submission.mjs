import {readFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {downloadVerified} from '../desktop/download.mjs';
import {installPackage,inspectPackage} from '../shared/folder-package.mjs';
import {validateManifest} from '../shared/manifest.mjs';
const manifest=validateManifest(JSON.parse(await readFile(process.argv[2],'utf8')));
await mkdir('artifacts/inspection',{recursive:true});
const temporary=await mkdtemp('artifacts/inspection/review-');
try {
 const path=await downloadVerified(manifest,temporary,{signal:AbortSignal.timeout(15*60*1000)});
 const info=await inspectPackage(path,{expectedSha256:manifest.sha256});
 const installed=await installPackage(path,temporary,{id:manifest.id,expectedSha256:manifest.sha256});
 for(const file of info.manifest.files.filter(f=>f.path.toLowerCase().endsWith('.exe'))) {
  execFileSync(process.env.JAVA||'java',['-cp','services/inspector/build','ExeInspector',join(installed.path,...file.path.split('/')),file.sha256],{stdio:'inherit',timeout:120000});
 }
 console.log(JSON.stringify({packageVerified:true,fileCount:info.fileCount,totalSize:info.totalSize,malwareScanned:false}));
} finally {await rm(temporary,{recursive:true,force:true});}
