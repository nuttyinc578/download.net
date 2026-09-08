#!/usr/bin/env node
import {buildPackage,inspectPackage} from '../shared/folder-package.mjs';
import {extractVfdn} from '../shared/vfdn-extract.mjs';
import {resolve,basename} from 'node:path';
export async function run(argv=process.argv.slice(2)) {
  const [command,...args]=argv;
  if(!command||['help','--help','-h'].includes(command)) {
    console.log('vnedfordownloaddotnet build <app-folder> --out <package.vfdn>\nvnedfordownloaddotnet inspect <package.vfdn>\nvfdn extract --vfnd <package.vfdn> -n <app-id> ----method-download.net -----plugin-download.net [--out <Programs-folder>] [--sha256 <reviewed-hash>]\n\nRequires Node.js 22+. Build bundles every regular file and empty folder; build your app with its own compiler first.');
    return;
  }
  if(command==='inspect'){if(args.length!==1)throw Error('Use: inspect <package.vfdn>');const info=await inspectPackage(resolve(args[0]));console.log(JSON.stringify(info,null,2));return;}
  if(command==='extract'){
    let file,id,root,expectedSha256;let method='download.net',plugin='download.net';
    for(let i=0;i<args.length;i++){
      const flag=args[i];
      if(flag==='----method-download.net'){method='download.net';continue;}
      if(flag==='-----plugin-download.net'){plugin='download.net';continue;}
      const keys={'--vfnd':'file','--vfdn':'file','-n':'id','--name':'id','--out':'root','--output':'root','-Output':'root','-Out':'root','--sha256':'hash','--method':'method','--plugin':'plugin'};
      if(keys[flag]){const value=args[++i];if(!value||value.startsWith('-'))throw Error('A value is required for '+flag);switch(keys[flag]){case 'file':file=value;break;case 'id':id=value;break;case 'root':root=value;break;case 'hash':expectedSha256=value;break;case 'method':method=value;break;case 'plugin':plugin=value;break;}}
      else if(!file&&!flag.startsWith('-'))file=flag;
      else throw Error('Unknown argument: '+flag);
    }
    if(!file||!id)throw Error('Use: vfdn extract --vfnd <package.vfdn> -n <app-id> ----method-download.net -----plugin-download.net');
    console.log(JSON.stringify(await extractVfdn(resolve(file),{id,root:root?resolve(root):undefined,expectedSha256,method,plugin}),null,2));return;
  }
  if(command!=='build')throw Error('Unknown command. Use build, inspect, extract, or --help.');
  let source,output;
  for(let i=0;i<args.length;i++){
    if(['--out','--output','-Output','-Out'].includes(args[i])){if(!args[i+1])throw Error('Output filename is required.');output=args[++i];}
    else if(args[i]==='--source'){if(!args[i+1])throw Error('Source folder is required.');source=args[++i];}
    else if(!source&&!args[i].startsWith('-'))source=args[i];
    else throw Error('Unknown argument: '+args[i]);
  }
  if(!source)throw Error('Choose the complete app folder: build <app-folder> --out <package.vfdn>');
  output=output||resolve(basename(resolve(source))+'.vfdn');
  const result=await buildPackage(source,output);
  console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});

