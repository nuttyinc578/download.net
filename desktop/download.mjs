import { createHash } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, rm, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { validateManifest } from '../shared/manifest.mjs';

export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
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
    if (!response.ok || !response.body) throw Error(`Download failed (${response.status}).`);
    return response;
  }
  throw Error('Too many download redirects.');
}
export async function downloadVerified(manifest, directory, {signal, progress = ()=>{}, fetcher = fetch} = {}) {
  const m = validateManifest(manifest);
  await mkdir(directory,{recursive:true});
  const target = join(directory,`${m.id}-${m.sha256.slice(0,16)}.vfdn`);
  try {
    if ((await stat(target)).size === m.size && await sha256(target) === m.sha256) { progress({stage:'downloaded',bytes:m.size,total:m.size,cached:true}); return target; }
  } catch { /* No reusable verified cache. */ }
  const temp = target + '.part';
  await rm(temp,{force:true});
  const hash = createHash('sha256'); let bytes = 0;
  let out;
  try {
    const response = await assetResponse(m.url,signal,fetcher);
    const length = response.headers.get('content-length');
    if (length && Number(length) !== m.size) { await response.body.cancel(); throw Error('File size differs from the reviewed manifest.'); }
    out = createWriteStream(temp,{flags:'wx'});
    let writeError; out.on('error',e=>{ writeError=e; });
    for await (const chunk of response.body) {
      if (signal?.aborted) throw Error('Download cancelled.');
      bytes += chunk.length;
      if (bytes > m.size) throw Error('Download exceeded its approved size.');
      if (writeError) throw writeError;
      hash.update(chunk);
      if (!out.write(chunk)) await once(out,'drain');
      progress({stage:'downloading',bytes,total:m.size});
    }
    out.end(); await once(out,'close');
    if (writeError) throw writeError;
    if (bytes !== m.size || hash.digest('hex') !== m.sha256) throw Error('Verification failed. The file was discarded.');
    await rename(temp,target);
    progress({stage:'downloaded',bytes,total:m.size,cached:false});
    return target;
  } catch (error) {
    if (out && !out.closed) { out.destroy(); await once(out,'close').catch(()=>{}); }
    await rm(temp,{force:true});
    throw error;
  }
}
