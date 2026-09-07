import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { sha256 } from './download.mjs';
import { validateManifest, MAX_SIZE } from '../shared/manifest.mjs';

const upstream = 'nuttyinc/download.net';
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
export async function publishApp(file, fields, token, progress = ()=>{}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 500) throw Error('Enter your GitHub personal access token.');
  let assetCreated = false; let publishedUrl;
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method, headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body ? {'Content-Type':'application/json'}:{})},
      body:body ? JSON.stringify(body):undefined, redirect:'error', signal:AbortSignal.timeout(60000)
    });
    if (!response.ok) throw Error(`GitHub ${method} failed (${response.status}). Check token access and repository permissions.`);
    return response.status === 204 ? null : response.json();
  };
  try {
    progress('Inspecting your executable');
    const inspection = await inspectExe(file);
    validateManifest({...fields,...inspection,publisher:'pending',url:'https://github.com/pending/pending/releases/download/pending/app.exe'});
    const user = await request('/user');
    if (!/^[a-zA-Z0-9-]+$/.test(user.login)) throw Error('Invalid GitHub account.');
    progress('Preparing your GitHub fork');
    const fork = await request(`/repos/${upstream}/forks`,'POST',{default_branch_only:true});
    if (!fork.fork || fork.parent?.full_name && fork.parent.full_name !== upstream || fork.owner.login !== user.login) throw Error('GitHub did not return your fork of download.net.');
    const repo = fork.full_name;
    let base;
    for (let i=0;i<12;i++) {
      try { base = await request(`/repos/${repo}/git/ref/heads/${fork.default_branch}`); break; }
      catch (e) { if (i===11) throw e; await new Promise(r=>setTimeout(r,1500)); }
    }
    const suffix = randomUUID().slice(0,8);
    const branch = `submission/${fields.id}-${suffix}`;
    await request(`/repos/${repo}/git/refs`,'POST',{ref:`refs/heads/${branch}`,sha:base.object.sha});
    progress('Uploading .exe to your GitHub release');
    const release = await request(`/repos/${repo}/releases`,'POST',{tag_name:`app-${fields.id}-${suffix}`,target_commitish:branch,name:`${fields.name} ${fields.version}`,body:'App submission for Nuttyinc review. Pending moderation; this is not approval.',prerelease:true});
    const upload = new URL(release.upload_url.replace(/\{.*$/,''));
    if (upload.protocol !== 'https:' || upload.hostname !== 'uploads.github.com') throw Error('Unexpected GitHub upload destination.');
    upload.searchParams.set('name',`${fields.id}.exe`);
    const uploaded = await fetch(upload,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream','Content-Length':String(inspection.size)},body:createReadStream(file),duplex:'half',redirect:'error',signal:AbortSignal.timeout(30*60*1000)});
    if (!uploaded.ok) throw Error(`GitHub file upload failed (${uploaded.status}).`);
    const asset = await uploaded.json(); assetCreated = true; publishedUrl=release.html_url;
    const manifest = validateManifest({...fields,...inspection,publisher:user.login,url:asset.browser_download_url});
    progress('Creating your review pull request');
    await request(`/repos/${repo}/contents/submissions/${fields.id}-${suffix}.json`,'PUT',{message:`Submit ${fields.name} ${fields.version}`,branch,content:Buffer.from(JSON.stringify(manifest,null,2)+'\n').toString('base64')});
    const upstreamRepo = await request(`/repos/${upstream}`);
    const pr = await request(`/repos/${upstream}/pulls`,'POST',{title:`App submission: ${fields.name} ${fields.version}`,head:`${user.login}:${branch}`,base:upstreamRepo.default_branch,body:`Submits ${fields.name} for catalog review.\n\n- Publisher: @${user.login}\n- SHA-256: \`${manifest.sha256}\`\n- Size: ${manifest.size} bytes\n- License: ${manifest.license}\n\nRequires manifest validation, executable inspection, AI moderation, and maintainer approval. Uploaded files must never be run during review.`});
    return {url:pr.html_url,number:pr.number};
  } catch (e) {
    if (assetCreated) throw Error(`${e.message} Your uploaded release remains at ${publishedUrl}; you can remove it from GitHub if you cancel.`);
    throw e;
  } finally { token = ''; }
}
