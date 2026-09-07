import {spawn,execFileSync} from 'node:child_process';
import {createHmac,randomBytes,createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const apiPort=await port(),bootPort=await port(),origin='http://127.0.0.1:'+apiPort,boot='http://127.0.0.1:'+bootPort;
const secret=randomBytes(32).toString('hex'),data=await mkdtemp(join(tmpdir(),'nutty-smoke-'));
const env={...process.env,BOOTSTRAP_SECRET:secret,NUTTY_API_URL:origin,PORT:String(bootPort),ASPNETCORE_URLS:origin,ASPNETCORE_ENVIRONMENT:'Development',DATA_DIR:data};
const jobs=[spawn('dotnet',[resolve('services/Api/bin/Release/net8.0/Api.dll')],{cwd:resolve('services/Api'),env,stdio:'ignore',windowsHide:true}),spawn(resolve(process.argv[2]),[],{env,stdio:'ignore',windowsHide:true})];
try{
 for(const url of [origin,boot]){let ok=false;for(let i=0;i<120;i++){try{ok=(await fetch(url+'/health',{signal:AbortSignal.timeout(1000)})).ok;if(ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}if(!ok)throw Error('Service startup failed: '+url);}
 const handshake=await (await fetch(boot+'/v1/bootstrap')).json();
 if(handshake.apiUrl!==origin||handshake.protocol!==1)throw Error('Bootstrap origin/protocol mismatch.');
 const response=await fetch(origin+'/api/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(handshake.ticket)});
 if(!response.ok||(await response.json()).verified!==true)throw Error('Go-to-C# ticket verification failed.');
 console.log('PASS: Go bootstrap -> C# verification -> Aspire website API.');
 const page=await fetch(origin+'/store.html');if(!page.ok)throw Error('Store page not served.');
 console.log('PASS: C# website serves the launcher storefront.');
 const payload=Buffer.alloc(256);payload.write('MZ');payload.writeUInt32LE(128,60);payload.write('PE\0\0',128);payload.writeUInt16LE(0x8664,132);
 const file=join(data,'fixture.exe');await writeFile(file,payload);
 const hash=createHash('sha256').update(payload).digest('hex');
 const result=execFileSync(process.env.JAVA||'java',['-cp',resolve('services/inspector/build'),'ExeInspector',file,hash],{encoding:'utf8',timeout:60000,windowsHide:true});
 if(!JSON.parse(result).structurallyValid)throw Error('Java inspection failed.');
 console.log('PASS: Java inspection verifies PE structure and SHA-256 without executing the file.');
}finally{for(const child of jobs){child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}await rm(data,{recursive:true,force:true});}

