import {rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
export function checkCancelled(signal) {
  if(signal?.aborted) throw Error('Operation cancelled.');
}
export async function retryFileOperation(operation,{signal,wait=delay,attempts=5}={}) {
  for(let attempt=0;;attempt++) {
    checkCancelled(signal);
    try {return await operation();}
    catch(error) {
      if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=attempts-1)throw error;
      await wait(Math.min(100*2**attempt,800));
    }
  }
}
export function fileOperationError(error,location,activity='use this folder') {
  if(!['EACCES','EPERM','EBUSY','ENOSPC','ENAMETOOLONG','EROFS','ENOENT','ENOTDIR'].includes(error?.code))return error;
  const guidance=error.code==='ENOSPC'?'The drive is full. Free some space and try again.'
    :error.code==='ENAMETOOLONG'?'The file path is too long. Choose a shorter installation folder.'
    :['ENOENT','ENOTDIR'].includes(error.code)?'The folder or a required file is missing. Check the location and try again.'
    :'Windows denied access or a file is in use. Close the app using that file and choose a folder owned by your Windows account.';
  const result=new Error('Cannot '+activity+' at "'+location+'". '+guidance,{cause:error});
  result.code=error.code;result.path=error.path||location;return result;
}
// Only call for a unique temporary path created and owned by this operation.
export async function cleanupOwnedPath(location,{recursive=false,onWarning=()=>{}}={}) {
  try {await rm(location,{recursive,force:true,maxRetries:4,retryDelay:150});}
  catch(error) {try {onWarning('Temporary files could not be removed at "'+location+'" ('+error.code+').');}catch { /* Cleanup must not replace the operation result. */ }}
}
