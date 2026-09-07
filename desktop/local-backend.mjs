import {spawn} from 'node:child_process';
import {mkdir, access} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline';

// Each child reserves its own loopback port and reports it only after binding.
export async function startLocalBackend({runtimeDir, dataDir, onExit = () => {}, startupTimeout = 45000}) {
  await mkdir(dataDir, {recursive:true});
  const apiExe=join(runtimeDir,'api','Api.exe');
  const bootstrapExe=join(runtimeDir,'bootstrap','nuttyinc-bootstrap.exe');
  for(const file of [apiExe,bootstrapExe]) {
    try { await access(file); } catch { throw Error('Bundled Nuttyinc service files are missing. Reinstall the latest launcher.'); }
  }
  const children=[];
  let stopping=false, stopped;
  const secret=randomBytes(32).toString('hex');
  const env={...process.env,NUTTY_DESKTOP:'1',BOOTSTRAP_SECRET:secret,DATA_DIR:dataDir,ASPNETCORE_ENVIRONMENT:'Production',DOTNET_NOLOGO:'1',DOTNET_EnableDiagnostics:'0'};
  async function stop() {
    if(stopped)return stopped;
    stopping=true;
    stopped=Promise.all(children.map(child=>new Promise(resolve=>{
      if(!child.pid||child.exitCode!==null||child.signalCode!==null){resolve();return;}
      const timer=setTimeout(()=>child.kill(),3000);
      child.once('exit',()=>{clearTimeout(timer);resolve();});
      // Both services shut down on stdin EOF, including when Electron exits unexpectedly.
      child.stdin.end();
    })));
    return stopped;
  }
  function launch(file, serviceEnv) {
    return new Promise((resolve,reject)=>{
      const child=spawn(file,[],{cwd:join(file,'..'),env:serviceEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});
      children.push(child);
      let ready=false, settled=false;
      const lines=createInterface({input:child.stdout});
      child.stderr.on('data',()=>{});
      child.stdin.on('error',()=>{});
      const fail=error=>{if(!settled){settled=true;clearTimeout(timer);reject(error);}};
      const timer=setTimeout(()=>fail(Error('Nuttyinc services took too long to start. Try reopening the launcher.')),startupTimeout);
      child.once('error',()=>fail(Error('Windows could not start the bundled Nuttyinc services. Reinstall the launcher.')));
      child.once('exit',()=>{
        lines.close();
        fail(Error('A bundled Nuttyinc service stopped during startup. Try reopening the launcher.'));
        if(ready&&!stopping){void stop();onExit('The local Nuttyinc service stopped. Close and reopen the launcher to reconnect.');}
      });
      lines.on('line',line=>{
        if(settled||!line.startsWith('NUTTYINC_READY '))return;
        try{
          const data=JSON.parse(line.slice(15));const url=new URL(data.url);
          if(data.protocol!==1||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw Error();
          settled=true;ready=true;clearTimeout(timer);resolve(url.origin);
        }catch{fail(Error('The bundled Nuttyinc service returned an invalid local address.'));}
      });
    });
  }
  try {
    const apiUrl=await launch(apiExe,env);
    const bootstrapUrl=await launch(bootstrapExe,{...env,NUTTY_API_URL:apiUrl});
    const options={signal:AbortSignal.timeout(10000),redirect:'error'};
    const handshake=await fetch(bootstrapUrl+'/v1/bootstrap',options);
    if(!handshake.ok)throw Error('Local Bootstrap did not become ready.');
    const value=await handshake.json();
    if(value.protocol!==1||value.apiUrl!==apiUrl)throw Error('Local Bootstrap returned the wrong API address.');
    const verified=await fetch(apiUrl+'/api/verify',{...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value.ticket)});
    if(!verified.ok||(await verified.json()).verified!==true)throw Error('The bundled Nuttyinc services could not verify their connection.');
    return {apiUrl,bootstrapUrl,stop};
  }catch(error){await stop();throw error;}
}
