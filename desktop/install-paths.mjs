import {mkdtemp,open,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {safeDirectory} from '../shared/folder-package.mjs';
import {defaultProgramsRoot} from '../shared/vfdn-extract.mjs';
import {retryFileOperation,cleanupOwnedPath,fileOperationError,checkCancelled} from '../shared/fs-operations.mjs';

export async function writableProgramsRoot(root,{signal}={}) {
  let probe;
  try {
    checkCancelled(signal);
    root=await safeDirectory(root,true);
    probe=await mkdtemp(join(root,'.download-net-check-'));
    const file=await open(join(probe,'write-check'),'wx');
    try {await file.writeFile('download.net');}finally {await file.close();}
    await retryFileOperation(()=>rename(join(probe,'write-check'),join(probe,'renamed')),{signal});
    return root;
  } catch(error) {throw fileOperationError(error,root,'write app files');}
  finally {if(probe)await cleanupOwnedPath(probe,{recursive:true});}
}
export async function resolveProgramsRoot(requested,{recommended=defaultProgramsRoot(),probe=writableProgramsRoot,signal}={}) {
  // Repair the common placeholder path that omits the Windows account name.
  if(/^[a-z]:[\\/]users?[\\/]appdata[\\/]local[\\/]programs[\\/]?$/i.test(requested)) {
    const root=await probe(recommended,{signal});
    return {root,notice:'Corrected the installation folder to your Windows account: '+root};
  }
  try {return {root:await probe(requested,{signal}),notice:null};}
  catch(error) {
    if(!['EACCES','EPERM','EROFS','ENOENT','ENOTDIR'].includes(error.code)||resolve(requested).toLowerCase()===resolve(recommended).toLowerCase())throw error;
    const root=await probe(recommended,{signal});
    return {root,notice:'Windows could not use "'+requested+'". Apps will be installed in your account’s Programs folder: '+root};
  }
}
