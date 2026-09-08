import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {createHash,createHmac,randomBytes,pbkdf2Sync} from 'node:crypto';import {createServer} from 'node:net';
 test('signup requires current covenant acceptance, persists server evidence, and preserves old accounts',async t=>{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const origin=`http://127.0.0.1:${port}`;const data=await mkdtemp(join(tmpdir(),'nutty-api-'));const secret=randomBytes(32).toString('hex');
 const listing={id:'folder-app',name:'Folder app',description:'All files included',kind:'app',version:'1.0',publisher:'tester',url:'https://github.com/tester/apps/releases/download/v1/app.vfdn',size:100,sha256:'a'.repeat(64),license:'MIT'};
 const catalogFile=join(data,'catalog-source.json');await writeFile(catalogFile,JSON.stringify([{...listing,url:listing.url.replace('.vfdn','.exe')}]));
 const policy=JSON.parse(await readFile('web/conduct.json','utf8'));
 const password='Existing-long-password-123!',salt=randomBytes(16),legacy={Name:'Legacy',Email:'legacy@example.test',Salt:salt.toString('hex'),Hash:pbkdf2Sync(password,salt,600000,32,'sha256').toString('hex')};
 await writeFile(join(data,'users.json'),JSON.stringify([legacy]));
 const child=spawn('dotnet',[resolve('services/Api/bin/Release/net8.0/Api.dll')],{cwd:resolve('services/Api'),env:{...process.env,ASPNETCORE_URLS:origin,ASPNETCORE_ENVIRONMENT:'Development',BOOTSTRAP_SECRET:secret,DATA_DIR:data,CATALOG_FILE:catalogFile},stdio:'pipe',windowsHide:true});
 let log='';child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
 t.after(async()=>{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await rm(data,{recursive:true,force:true});});
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(origin+'/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,log);

 const post=body=>fetch(origin+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const credentials={name:'New user',email:'new@example.test',password:'A-long-new-password-123!',acceptedCodeOfConduct:true,codeOfConductVersion:policy.version,codeOfConductSha256:policy.sha256};
 for(const change of [{acceptedCodeOfConduct:undefined},{acceptedCodeOfConduct:false},{codeOfConductVersion:'3.0'},{codeOfConductVersion:undefined},{codeOfConductSha256:'0'.repeat(64)},{codeOfConductSha256:undefined}]){
  const response=await post({...credentials,...change});assert.equal(response.status,400);assert.equal((await response.json()).code,'conduct_acceptance_required');
 }
 assert.deepEqual(JSON.parse(await readFile(join(data,'users.json'),'utf8')),[legacy]);
 const before=Date.now();assert.equal((await post({...credentials,acceptedAt:'2000-01-01'})).status,200);
 const stored=JSON.parse(await readFile(join(data,'users.json'),'utf8'));const consent=stored[1].CodeOfConduct;
 assert.equal(consent.Version,policy.version);assert.equal(consent.Sha256,policy.sha256);assert.ok(Date.parse(consent.AcceptedAt)>=before&&Date.parse(consent.AcceptedAt)<=Date.now());assert.ok(!JSON.stringify(stored).includes(credentials.password));
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:legacy.Email,password})});assert.equal(login.status,200);assert.equal(stored[0].CodeOfConduct,null);
 });
 test('the bundled covenant and backend enforce the same canonical document',async()=>{
 const md=(await readFile('CODE_OF_CONDUCT.md','utf8')).replace(/^\uFEFF/,'').replaceAll('\r\n','\n').trimEnd()+'\n';
 const policy=JSON.parse(await readFile('web/conduct.json','utf8'));assert.equal(policy.sha256,createHash('sha256').update(md).digest('hex'));assert.equal(policy.version,'2.1');
 assert.ok((await readFile('services/Api/ConductPolicy.g.cs','utf8')).includes(policy.sha256));assert.ok((await readFile('web/conduct.js','utf8')).includes(policy.sha256));
 assert.match(await readFile('web/conduct.html','utf8'),/Our Pledge/);assert.match(md,/Attribution 4.0/);
 });
