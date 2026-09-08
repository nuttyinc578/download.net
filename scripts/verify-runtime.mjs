import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startLocalBackend} from '../desktop/local-backend.mjs';
const runtimeDir=resolve(process.argv[2]||'artifacts/runtime');
const dataDir=await mkdtemp(join(tmpdir(),'nuttyinc-runtime-check-'));
const conduct=JSON.parse(await readFile('web/conduct.json','utf8'));
 const credentials={acceptedCodeOfConduct:true,codeOfConductVersion:conduct.version,codeOfConductSha256:conduct.sha256,name:'Runtime test',email:'runtime@example.test',password:randomBytes(24).toString('hex')};
async function json(base,path,body,cookie){return fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});}
let backend;
try{
  backend=await startLocalBackend({runtimeDir,dataDir});
  const first=backend;
  assert.equal((await json(first.apiUrl,'/api/auth/signup',{...credentials,acceptedCodeOfConduct:false})).status,400,'packaged backend must enforce consent');
  const signup=await json(first.apiUrl,'/api/auth/signup',credentials);
  assert.equal(signup.status,200,await signup.text());
  const cookie=signup.headers.get('set-cookie').split(';')[0];
  assert.equal(signup.headers.get('set-cookie').toLowerCase().includes('; secure'),false,'loopback desktop accounts need a usable local cookie');
  const me=await json(first.apiUrl,'/api/auth/me',undefined,cookie);
  assert.equal((await me.json()).email,credentials.email);
  assert.equal((await json(first.apiUrl,'/api/auth/logout',{},cookie)).status,200);
  assert.equal((await json(first.apiUrl,'/api/auth/me',undefined,cookie)).status,401);
  const users=JSON.parse(await readFile(join(dataDir,'users.json'),'utf8'));
  assert.equal(users[0].CodeOfConduct.Version,conduct.version);assert.equal(users[0].CodeOfConduct.Sha256,conduct.sha256);assert.ok(Date.parse(users[0].CodeOfConduct.AcceptedAt));
  assert.equal(users.length,1);assert.ok(!JSON.stringify(users).includes(credentials.password));
  await first.stop();
  await assert.rejects(fetch(first.apiUrl+'/health',{signal:AbortSignal.timeout(2000)}));
  await assert.rejects(fetch(first.bootstrapUrl+'/health',{signal:AbortSignal.timeout(2000)}));
  backend=await startLocalBackend({runtimeDir,dataDir});
  const login=await json(backend.apiUrl,'/api/auth/login',credentials);
  assert.equal(login.status,200,await login.text());
  console.log('PASS: bundled services start, verify Bootstrap, create an account, authenticate, log out, preserve accounts across restart, and stop with the launcher.');
}finally{await backend?.stop();}
