import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {createHmac,randomBytes} from 'node:crypto';import {createServer} from 'node:net';
test('backend account lifecycle and signed one-use bootstrap verification',async t=>{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const origin=`http://127.0.0.1:${port}`;const data=await mkdtemp(join(tmpdir(),'nutty-api-'));const secret=randomBytes(32).toString('hex');
 const child=spawn('dotnet',[resolve('services/Api/bin/Release/net8.0/Api.dll')],{cwd:resolve('services/Api'),env:{...process.env,ASPNETCORE_URLS:origin,ASPNETCORE_ENVIRONMENT:'Development',BOOTSTRAP_SECRET:secret,DATA_DIR:data},stdio:'pipe',windowsHide:true});
 let log='';child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
 t.after(async()=>{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await rm(data,{recursive:true,force:true});});
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(origin+'/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,log);
 const post=(path,body,cookie)=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 assert.equal((await post('/api/auth/signup',{name:'Test',email:'user@example.test',password:'short'})).status,400);
 const credentials={name:'Test User',email:'user@example.test',password:'Correct-long-passphrase-123!'};
 const signup=await post('/api/auth/signup',credentials);assert.equal(signup.status,200);const cookie=signup.headers.get('set-cookie').split(';')[0];assert.match(signup.headers.get('set-cookie'),/httponly/i);
 const me=await fetch(origin+'/api/auth/me',{headers:{Cookie:cookie}});assert.equal(me.status,200);assert.equal((await me.json()).email,credentials.email);
 assert.equal((await post('/api/auth/signup',credentials)).status,409);
 assert.equal((await post('/api/auth/login',{...credentials,password:'wrong'})).status,401);
 assert.equal((await post('/api/auth/login',credentials)).status,200);
 const stored=await readFile(join(data,'users.json'),'utf8');assert.ok(!stored.includes(credentials.password));assert.match(stored,/Salt/);
 await post('/api/auth/logout',{},cookie);assert.equal((await fetch(origin+'/api/auth/me',{headers:{Cookie:cookie}})).status,401);
 function ticket(expires=Math.floor(Date.now()/1000)+60){const nonce=randomBytes(16).toString('hex');return{nonce,expires,signature:createHmac('sha256',secret).update(`${nonce}.${expires}`).digest('hex')};}
 const valid=ticket();assert.equal((await post('/api/verify',valid)).status,200);assert.equal((await post('/api/verify',valid)).status,409);
 assert.equal((await post('/api/verify',{...ticket(),signature:'00'.repeat(32)})).status,401);
 assert.equal((await post('/api/verify',ticket(Math.floor(Date.now()/1000)-1))).status,401);
});
