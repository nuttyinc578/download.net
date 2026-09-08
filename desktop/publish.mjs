import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildPackage} from '../shared/folder-package.mjs';
import { createReadStream } from 'node:fs';
import { open, stat, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { sha256 } from './download.mjs';
import { validateManifest, MAX_SIZE } from '../shared/manifest.mjs';

const upstream = 'nuttyinc578/download.net';
export async function inspectExe(file) {
  if (!file.toLowerCase().endsWith('.exe')) throw Error('Select a Windows .exe file.');
  const info = await stat(file);
  if (!info.isFile() || info.size < 64 || info.size > MAX_SIZE) throw Error('Select a valid .exe smaller than 2 GiB.');
  const handle = await open(file,'r');
  try {
    const dos = Buffer.alloc(64); await handle.read(dos,0,64,0);
    if (dos.toString('ascii',0,2) !== 'MZ') throw Error('Missing Windows executable header.');
    const offset = dos.readUInt32LE(60);
    if (offset < 64 || offset > info.size - 6) throw Error('Invalid PE header offset.');
    const pe = Buffer.alloc(6); await handle.read(pe,0,6,offset);
    if (pe.readUInt32LE(0) !== 0x4550) throw Error('Not a Windows PE executable.');
    if (![0x14c,0x8664,0xaa64].includes(pe.readUInt16LE(4))) throw Error('Unsupported executable architecture.');
    return {size:info.size,sha256:await sha256(file)};
  } finally { await handle.close(); }
}
export async function publishApp(source, fields, token, progress = ()=>{}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 500) throw Error('Enter your GitHub personal access token.');
  let assetCreated = false; let publishedUrl, temporary;
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method, headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body ? {'Content-Type':'application/json'}:{})},
      body:body ? JSON.stringify(body):undefined, redirect:'error', signal:AbortSignal.timeout(60000)
    });
    if (!response.ok) {const error=Error(`GitHub ${method} failed (${response.status}). Check token access and repository permissions.`);error.status=response.status;throw error;}
    return response.status === 204 ? null : response.json();
  };
  try {
    progress('Packaging your complete app folder');
    temporary=await mkdtemp(join(tmpdir(),'nutty-publish-'));
    const file=join(temporary,'app.vfdn');
    const inspection = await buildPackage(source,file,{progress});
    validateManifest({...fields,...inspection,publisher:'pending',url:'https://github.com/pending/pending/releases/download/pending/app.vfdn'});
    const user = await request('/user');
    if (!/^[a-zA-Z0-9-]+$/.test(user.login)) throw Error('Invalid GitHub account.');
    const upstreamRepo = await request('/repos/'+upstream);
    const writable=upstreamRepo.permissions?.push===true;
    let repo=upstream;
    if(writable)progress('Preparing a submission branch in the catalog repository');
    else {
      progress('Preparing your GitHub fork');
      let fork;
      try{fork=await request('/repos/'+user.login+'/download.net');}catch(e){if(e.status!==404)throw e;}
      if(!fork)fork=await request('/repos/'+upstream+'/forks','POST',{default_branch_only:true});
      if(!fork.parent)fork=await request('/repos/'+fork.full_name);
      if(!fork.fork||fork.parent?.full_name?.toLowerCase()!==upstream||fork.owner?.login?.toLowerCase()!==user.login.toLowerCase()||!new RegExp('^'+user.login+'/[a-zA-Z0-9_.-]+$','i').test(fork.full_name))throw Error('Your download.net repository is not a fork of the Nuttyinc catalog.');
      repo=fork.full_name;
    }
    // Base every submission on upstream main, including when an existing fork is stale.
    const base=await request('/repos/'+upstream+'/git/ref/heads/'+upstreamRepo.default_branch);
    const suffix = randomUUID().slice(0,8);
    const branch = `submission/${fields.id}-${suffix}`;
    for(let attempt=0;;attempt++){
      try{await request('/repos/'+repo+'/git/refs','POST',{ref:'refs/heads/'+branch,sha:base.object.sha});break;}
      catch(e){if(writable||attempt>=11||![404,409,422].includes(e.status))throw e;await new Promise(r=>setTimeout(r,1500));}
    }
    progress('Uploading your folder package to GitHub');
    const release = await request(`/repos/${repo}/releases`,'POST',{tag_name:`app-${fields.id}-${suffix}`,target_commitish:branch,name:`${fields.name} ${fields.version}`,body:'App submission for Nuttyinc review. Pending moderation; this is not approval.',prerelease:true});
    const upload = new URL(release.upload_url.replace(/\{.*$/,''));
    if (upload.protocol !== 'https:' || upload.hostname !== 'uploads.github.com') throw Error('Unexpected GitHub upload destination.');
    upload.searchParams.set('name',`${fields.id}.vfdn`);
    const uploaded = await fetch(upload,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream','Content-Length':String(inspection.size)},body:createReadStream(file),duplex:'half',redirect:'error',signal:AbortSignal.timeout(30*60*1000)});
    if (!uploaded.ok) throw Error(`GitHub file upload failed (${uploaded.status}).`);
    const asset = await uploaded.json(); assetCreated = true; publishedUrl=release.html_url;
    const manifest = validateManifest({...fields,...inspection,publisher:user.login,url:asset.browser_download_url});
    progress('Creating your review pull request');
    await request(`/repos/${repo}/contents/catalog/submissions/${fields.id}-${suffix}.json`,'PUT',{message:`Submit ${fields.name} ${fields.version}`,branch,content:Buffer.from(JSON.stringify(manifest,null,2)+'\n').toString('base64')});
    const pr = await request(`/repos/${upstream}/pulls`,'POST',{title:`App submission: ${fields.name} ${fields.version}`,head:writable?branch:`${user.login}:${branch}`,base:upstreamRepo.default_branch,body:`Submits ${fields.name} for catalog review.\n\n- Publisher: @${user.login}\n- SHA-256: \`${manifest.sha256}\`\n- Size: ${manifest.size} bytes\n- License: ${manifest.license}\n\nA maintainer merge approves publication. The catalog workflow verifies the folder package and executable structure, plus AI listing moderation when configured, before listing it. Uploaded files must never be run during review.`});
    return {url:pr.html_url,number:pr.number};
  } catch (e) {
    if (assetCreated) throw Error(`${e.message} Your uploaded release remains at ${publishedUrl}; you can remove it from GitHub if you cancel.`);
    throw e;
  } finally { token = ''; if(temporary)await rm(temporary,{recursive:true,force:true}); }
}
