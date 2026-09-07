import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
try{for(const line of (await readFile('.env','utf8')).split(/\r?\n/)){if(!line||line.startsWith('#'))continue;const i=line.indexOf('=');if(i>0)process.env[line.slice(0,i)]=line.slice(i+1);}}catch{}
process.env.BOOTSTRAP_SECRET ||= randomBytes(32).toString('hex');
process.env.NUTTY_API_URL ||= 'http://127.0.0.1:5080';
process.env.NUTTY_BOOTSTRAP_URL ||= 'http://127.0.0.1:5090';
process.env.ASPNETCORE_URLS ||= process.env.NUTTY_API_URL;
process.env.ASPNETCORE_ENVIRONMENT ||= 'Development';
const jobs=[];
function run(command,args,cwd){const child=spawn(command,args,{cwd,env:process.env,stdio:'inherit',windowsHide:true});child.on('error',e=>{console.error(e.message);shutdown();});jobs.push(child);return child;}
function shutdown(){for(const child of jobs)child.kill();process.exit();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
run('dotnet',['run','--project','Api.csproj'], 'services/Api');
run('go',['run','.'],'services/bootstrap');
console.log('Nuttyinc website: '+process.env.NUTTY_API_URL+' — press Ctrl+C to stop.');
console.log('After the API starts, launch the desktop app with npm start. Enter the local server URLs in Settings.');

