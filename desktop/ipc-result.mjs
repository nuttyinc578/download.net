export async function ipcResult(action) {
  try {return {ok:true,value:await action()};}
  catch(error) {return {ok:false,error:String(error?.message||error||'The operation failed.')};}
}
