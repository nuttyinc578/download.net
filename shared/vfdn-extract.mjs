import {installPackage,inspectPackage} from './folder-package.mjs';
import {join} from 'node:path';
import {homedir} from 'node:os';
export function defaultProgramsRoot(){return join(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'),'Programs');}
export async function extractVfdn(file,{root=defaultProgramsRoot(),id,expectedSha256,method='download.net',plugin='download.net',signal,progress}={}){
 if(method!=='download.net'||plugin!=='download.net')throw Error('Only the bundled download.net extraction method and plugin are supported.');
 // Packages are data: do not evaluate scripts or load plugins from downloaded files.
 if(!expectedSha256)expectedSha256=(await inspectPackage(file,{signal})).sha256;
 return installPackage(file,root,{id,expectedSha256,signal,progress});
}
