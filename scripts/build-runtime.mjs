import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const destination=resolve('artifacts/runtime');
await mkdir(destination,{recursive:true});
execFileSync('dotnet',['publish','services/Api/Api.csproj','-c','Release','-r','win-x64','--self-contained','true','-o',resolve(destination,'api'),'-p:DebugType=None','-p:DebugSymbols=false'],{stdio:'inherit',windowsHide:true});
await mkdir(resolve(destination,'bootstrap'),{recursive:true});
execFileSync('go',['build','-trimpath','-o',resolve(destination,'bootstrap/nuttyinc-bootstrap.exe'),'.'],{cwd:'services/bootstrap',stdio:'inherit',windowsHide:true,env:{...process.env,GOOS:'windows',GOARCH:'amd64',CGO_ENABLED:'0'}});
console.log('Bundled the .NET API runtime and Go Bootstrap. End users do not need developer SDKs.');
