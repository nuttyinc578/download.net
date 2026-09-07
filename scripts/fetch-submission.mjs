import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {validateManifest} from '../shared/manifest.mjs';
const number=process.env.PR_NUMBER;
if(!/^[1-9]\d*$/.test(number||''))throw Error('Invalid pull request number.');
const root='https://api.github.com/repos/nuttyinc578/download.net';
async function get(url){const u=new URL(url);if(u.origin!=='https://api.github.com')throw Error('Invalid API host');const r=await fetch(u,{headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`GitHub ${r.status}`);return r.json();}
const pr=await get(`${root}/pulls/${number}`);
const files=await get(`${root}/pulls/${number}/files?per_page=100`);
const submissions=files.filter(f=>/^submissions\/[a-z0-9-]+\.json$/.test(f.filename)&&f.status!=='removed');
if(submissions.length!==1||files.length!==1)throw Error('App submission PRs must contain exactly one new or updated submission manifest.');
const path=submissions[0].filename;
const file=await get(`https://api.github.com/repos/${pr.head.repo.full_name}/contents/${path}?ref=${pr.head.sha}`);
if(file.size>20000||file.encoding!=='base64')throw Error('Invalid submission file.');
const manifest=validateManifest(JSON.parse(Buffer.from(file.content,'base64').toString('utf8')));
await writeFile('review-input.json',JSON.stringify(manifest,null,2));
await writeFile('review-provenance.json',JSON.stringify({pullRequest:Number(number),headSha:pr.head.sha,manifestPath:path,sha256:manifest.sha256,manifestSha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')},null,2));

