import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open,rm,rename,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {validateManifest} from '../shared/manifest.mjs';
import {safeDirectory} from '../shared/folder-package.mjs';
import {checkCancelled,retryFileOperation,cleanupOwnedPath,fileOperationError} from '../shared/fs-operations.mjs';

export async function sha256(file,signal) {
  checkCancelled(signal);
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file)) {checkCancelled(signal);hash.update(chunk);}
  checkCancelled(signal);return hash.digest('hex');
}
export function allowedAssetURL(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname)) throw Error('Download redirected to an untrusted host.');
  return u;
}
export async function assetResponse(url, signal, fetcher = fetch) {
  for (let n = 0; n < 6; n++) {
    allowedAssetURL(url);
    const response = await fetcher(url, { redirect:'manual', signal });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw Error('Redirect has no destination.');
      url = new URL(location,url).href; continue;
    }
    if (!response.ok || !response.body) {await response.body?.cancel();throw Error(`Download failed (${response.status}).`);}
    return response;
  }
  throw Error('Too many download redirects.');
}
export async function downloadVerified(manifest,directory,{signal,progress=()=>{},fetcher=fetch}={}) {
  const m=validateManifest(manifest);checkCancelled(signal);
  let temp,out;
  try {
    directory=await safeDirectory(directory,true);
    const target=join(directory,m.id+'-'+m.sha256.slice(0,16)+'.vfdn');
    let cached;
    try {cached=await lstat(target);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(cached) {
      if(cached.isSymbolicLink()||!cached.isFile())throw Error('The package cache contains an unsafe file or link.');
      if(cached.size===m.size&&await sha256(target,signal)===m.sha256) {
        checkCancelled(signal);progress({stage:'downloaded',bytes:m.size,total:m.size,cached:true});return target;
      }
      await retryFileOperation(()=>rm(target,{force:true}),{signal});
    }
    temp=target+'.'+randomUUID()+'.part';out=await open(temp,'wx');
    const response=await assetResponse(m.url,signal,fetcher);
    const length=response.headers.get('content-length');
    if(length&&Number(length)!==m.size) {await response.body.cancel();throw Error('File size differs from the reviewed manifest.');}
    const hash=createHash('sha256');let bytes=0;
    for await(const chunk of response.body) {
      checkCancelled(signal);bytes+=chunk.length;
      if(bytes>m.size)throw Error('Download exceeded its approved size.');
      hash.update(chunk);
      let offset=0;
      while(offset<chunk.length) {
        const {bytesWritten}=await out.write(chunk,offset,chunk.length-offset);
        if(!bytesWritten)throw Error('Unable to write the downloaded package.');
        offset+=bytesWritten;
      }
      progress({stage:'downloading',bytes,total:m.size});
    }
    checkCancelled(signal);
    if(bytes!==m.size||hash.digest('hex')!==m.sha256)throw Error('Verification failed. The file was discarded.');
    await out.sync();await out.close();out=null;
    await retryFileOperation(()=>rename(temp,target),{signal});temp=null;
    progress({stage:'downloaded',bytes,total:m.size,cached:false});return target;
  } catch(error) {throw fileOperationError(error,directory,'save the downloaded package');}
  finally {
    await out?.close().catch(()=>{});
    if(temp)await cleanupOwnedPath(temp,{onWarning:message=>progress({stage:'cleanup-warning',message})});
  }
}
