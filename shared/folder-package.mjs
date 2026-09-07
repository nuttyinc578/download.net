import {open, lstat, readdir, mkdir, mkdtemp, rm, rename, realpath} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {resolve, join, dirname, relative, isAbsolute, parse} from 'node:path';
import {MAX_SIZE} from './manifest.mjs';

const MAGIC = Buffer.from('VFDNPK1\n');
const MAX_HEADER = 8 * 1024 ** 2, MAX_ENTRIES = 20000;
const digest = () => createHash('sha256');
const cancelled = signal => { if (signal?.aborted) throw Error('Operation cancelled.'); };
function inside(root, path) { const r=relative(root,path); return r!=='' && r!=='..' && r.split(/[\\/]/)[0]!=='..' && !isAbsolute(r); }
export function validPackagePath(path) {
  if (typeof path!=='string' || !path || path.length>240 || path!==path.normalize('NFC')) throw Error('Invalid package path.');
  for (const part of path.split('/')) {
    if (!part || part==='.' || part==='..' || /[\\<>:"|?*\x00-\x1f\x7f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)) throw Error('Unsafe Windows package path: '+path);
  }
  return path;
}
export async function safeDirectory(path, create=false) {
  path=resolve(path); const root=parse(path).root;
  let current=root;
  for (const part of relative(root,path).split(/[\\/]/).filter(Boolean)) {
    current=join(current,part);
    if (create) await mkdir(current).catch(e=>{if(e.code!=='EEXIST')throw e;});
    const info=await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) throw Error('Installation/source folders cannot contain links: '+current);
  }
  return path;
}
async function readExactly(handle,length,position) {
  const buffer=Buffer.alloc(length); let offset=0;
  while(offset<length) {const {bytesRead}=await handle.read(buffer,offset,length-offset,position+offset);if(!bytesRead)throw Error('Truncated package.');offset+=bytesRead;}
  return buffer;
}
async function writeAll(handle,buffer) {
  let offset=0;while(offset<buffer.length){const {bytesWritten}=await handle.write(buffer,offset,buffer.length-offset);if(!bytesWritten)throw Error('Unable to write package.');offset+=bytesWritten;}
}
async function fileHash(file,signal) {
  const hash=digest();const handle=await open(file,'r');
  try {for await(const chunk of handle.createReadStream({autoClose:false})){cancelled(signal);hash.update(chunk);}return hash.digest('hex');}
  finally {await handle.close();}
}
export async function scanFolder(source,{signal}={}) {
  source=await safeDirectory(source);
  const files=[],directories=[]; let totalSize=0;
  async function walk(dir,prefix='') {
    const entries=await readdir(dir,{withFileTypes:true});
    entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for(const entry of entries) {
      cancelled(signal);
      const path=validPackagePath(prefix+entry.name),full=join(dir,entry.name),info=await lstat(full);
      if(info.isSymbolicLink())throw Error('Remove symbolic links or junctions before building: '+path);
      if(info.isDirectory()){directories.push(path);if(files.length+directories.length>MAX_ENTRIES)throw Error('Too many files/folders (maximum 20,000).');await walk(full,path+'/');}
      else if(info.isFile()) {
        totalSize+=info.size;if(totalSize>MAX_SIZE)throw Error('App folder exceeds 2 GiB.');
        files.push({path,size:info.size,sha256:await fileHash(full,signal)});
      } else throw Error('Unsupported file type: '+path);
      if(files.length+directories.length>MAX_ENTRIES)throw Error('Too many files/folders (maximum 20,000).');
    }
  }
  await walk(source);
  const manifest={format:'vfdn',version:1,directories,files};
  validateInventory(manifest);
  return {source,manifest,fileCount:files.length,totalSize};
}
function validateInventory(m) {
  if(m?.format!=='vfdn'||m.version!==1||!Array.isArray(m.files)||!Array.isArray(m.directories)||!m.files.length||m.files.length+m.directories.length>MAX_ENTRIES)throw Error('Invalid VFDN file inventory.');
  const entries=new Map();let totalSize=0;
  for(const [paths,type] of [[m.directories,'directory'],[m.files,'file']])for(const value of paths) {
    const path=validPackagePath(type==='file'?value?.path:value),key=path.toLowerCase();
    if(entries.has(key))throw Error('Duplicate or conflicting package path: '+path);
    entries.set(key,{path,type});
    if(type==='file') {
      if(!Number.isSafeInteger(value.size)||value.size<0||value.size>MAX_SIZE||!/^[a-f0-9]{64}$/.test(value.sha256))throw Error('Invalid file size/hash.');
      totalSize+=value.size;if(totalSize>MAX_SIZE)throw Error('Package exceeds 2 GiB.');
    }
  }
  for(const {path} of entries.values()) {
    const parts=path.split('/');parts.pop();
    while(parts.length) {
      const parent=parts.join('/'),entry=entries.get(parent.toLowerCase());
      if(!entry||entry.type!=='directory'||entry.path!==parent)throw Error('Missing or conflicting parent folder: '+path);
      parts.pop();
    }
  }
  return totalSize;
}
export async function buildPackage(source,output,{signal,progress=()=>{}}={}) {
  source=await safeDirectory(source);output=resolve(output);
  if(!output.toLowerCase().endsWith('.vfdn'))throw Error('Output must end in .vfdn.');
  if(inside(source,output))throw Error('Put the output package outside the app folder.');
  await safeDirectory(dirname(output),true);
  if(inside(await realpath(source),join(await realpath(dirname(output)),parse(output).base))||output===source)throw Error('Put the output package outside the app folder.');
  progress('Detecting all files and calculating hashes');
  const scan=await scanFolder(source,{signal}),header=Buffer.from(JSON.stringify(scan.manifest));
  if(header.length>MAX_HEADER||header.length+12+scan.totalSize>MAX_SIZE)throw Error('Package exceeds the header or 2 GiB download limit.');
  const prefix=Buffer.alloc(12);MAGIC.copy(prefix);prefix.writeUInt32LE(header.length,8);
  const temp=output+'.'+randomUUID()+'.part';let out;
  try {
    try{await lstat(output);throw Error('Output already exists. Choose a new package filename.');}catch(e){if(e.code!=='ENOENT')throw e;}
    out=await open(temp,'wx');const hash=digest();
    for(const buffer of [prefix,header]){await writeAll(out,buffer);hash.update(buffer);}
    for(const file of scan.manifest.files) {
      cancelled(signal);progress('Packaging '+file.path);
      const full=join(source,...file.path.split('/'));
      await safeDirectory(dirname(full));
      if((await lstat(full)).isSymbolicLink())throw Error('Source changed into a link: '+file.path);
      const input=await open(full,'r'),fileDigest=digest();let bytes=0;
      try {for await(const chunk of input.createReadStream({autoClose:false})){cancelled(signal);bytes+=chunk.length;if(bytes>file.size)throw Error('Source changed during build: '+file.path);fileDigest.update(chunk);hash.update(chunk);await writeAll(out,chunk);}}
      finally {await input.close();}
      if(bytes!==file.size||fileDigest.digest('hex')!==file.sha256)throw Error('Source changed during build: '+file.path);
    }
    await out.sync();await out.close();out=null;
    await rename(temp,output);
    return {path:output,size:12+header.length+scan.totalSize,sha256:hash.digest('hex'),fileCount:scan.fileCount,totalSize:scan.totalSize};
  } finally {await out?.close();await rm(temp,{force:true});}
}
async function readInventory(handle) {
  const size=(await handle.stat()).size;if(size>MAX_SIZE||size<12)throw Error('Invalid package size.');
  const prefix=await readExactly(handle,12,0);
  if(!prefix.subarray(0,8).equals(MAGIC))throw Error('Not a VFDN folder package.');
  const length=prefix.readUInt32LE(8);
  if(length<2||length>MAX_HEADER||length>size-12)throw Error('Invalid package header size.');
  const header=await readExactly(handle,length,12);let manifest;
  try{manifest=JSON.parse(header.toString('utf8'));}catch{throw Error('Invalid package JSON.');}
  const totalSize=validateInventory(manifest);
  if(12+length+totalSize!==size)throw Error('Package length differs from the file inventory.');
  return {manifest,totalSize,size,offset:12+length,prefix,header};
}
async function unpack(file,destination,{signal,expectedSha256,progress=()=>{}}={}) {
  const handle=await open(file,'r');
  try {
    const data=await readInventory(handle),hash=digest().update(data.prefix).update(data.header);
    if(destination)for(const path of [...data.manifest.directories].sort((a,b)=>a.split('/').length-b.split('/').length)){cancelled(signal);await mkdir(join(destination,...path.split('/')));}
    let position=data.offset,completed=0,bytes=0;
    for(const item of data.manifest.files) {
      cancelled(signal);const fileDigest=digest();let remaining=item.size,out;
      try {
        if(destination)out=await open(join(destination,...item.path.split('/')),'wx');
        while(remaining) {
          cancelled(signal);const chunk=await readExactly(handle,Math.min(1024**2,remaining),position);
          position+=chunk.length;remaining-=chunk.length;bytes+=chunk.length;
          hash.update(chunk);fileDigest.update(chunk);if(out)await writeAll(out,chunk);
          progress({stage:'installing',bytes,total:data.totalSize,files:completed,fileCount:data.manifest.files.length});
        }
      } finally {await out?.close();}
      if(fileDigest.digest('hex')!==item.sha256)throw Error('File verification failed: '+item.path);
      completed++;
    }
    const sha256=hash.digest('hex');
    if(expectedSha256&&sha256!==expectedSha256)throw Error('Package SHA-256 differs from the reviewed manifest.');
    cancelled(signal);
    return {manifest:data.manifest,sha256,size:data.size,totalSize:data.totalSize,fileCount:data.manifest.files.length};
  } finally {await handle.close();}
}
export const inspectPackage=(file,options={})=>unpack(file,null,options);
export async function installPackage(file,root,{id,expectedSha256,signal,progress=()=>{}}={}) {
  if(!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)||!/^[a-f0-9]{64}$/.test(expectedSha256))throw Error('A reviewed app ID and package hash are required.');
  cancelled(signal);root=await safeDirectory(root,true);
  const target=join(root,id+'-'+expectedSha256.slice(0,16));
  // Each build gets a new folder. Existing app files and user data are never overwritten.
  let existing=false;
  try{await lstat(target);existing=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(existing) {
    await safeDirectory(target);const data=await inspectPackage(file,{signal,expectedSha256});
    for(const dir of data.manifest.directories)await safeDirectory(join(target,...dir.split('/')));
    for(const item of data.manifest.files) {
      const path=join(target,...item.path.split('/'));await safeDirectory(dirname(path));const info=await lstat(path);
      if(info.isSymbolicLink()||!info.isFile()||info.size!==item.size||await fileHash(path,signal)!==item.sha256)throw Error('Existing installation has changed. Choose another Programs folder in Settings.');
    }
    cancelled(signal);progress({stage:'complete',cached:true});return {path:target,fileCount:data.fileCount,cached:true};
  }
  const staging=await mkdtemp(join(root,'.vfdn-'));
  try {
    const data=await unpack(file,staging,{signal,expectedSha256,progress});
    cancelled(signal);
    try{await lstat(target);throw Error('Installation folder appeared during download. Try again.');}catch(e){if(e.code!=='ENOENT')throw e;}
    await rename(staging,target);
    progress({stage:'complete',bytes:data.totalSize,total:data.totalSize});
    return {path:target,fileCount:data.fileCount,cached:false};
  } finally {
    if(!inside(root,staging)||!parse(staging).base.startsWith('.vfdn-'))throw Error('Refusing to remove an unexpected staging path.');
    await rm(staging,{recursive:true,force:true});
  }
}

