#!/usr/bin/env node
import {buildPackage,inspectPackage} from '../shared/folder-package.mjs';
import {resolve,basename} from 'node:path';
export async function run(argv=process.argv.slice(2)) {
  const [command,...args]=argv;
  if(!command||['help','--help','-h'].includes(command)) {
    console.log('vnedfordownloaddotnet build <app-folder> --out <package.vfdn>\nvnedfordownloaddotnet inspect <package.vfdn>\n\nRequires Node.js 22+. Build bundles every regular file and empty folder; build your app with its own compiler first.');
    return;
  }
  if(command==='inspect'){if(args.length!==1)throw Error('Use: inspect <package.vfdn>');const info=await inspectPackage(resolve(args[0]));console.log(JSON.stringify(info,null,2));return;}
  if(command!=='build')throw Error('Unknown command. Use build, inspect, or --help.');
  let source,output;
  for(let i=0;i<args.length;i++){
    if(['--out','--output'].includes(args[i])){if(!args[i+1])throw Error('Output filename is required.');output=args[++i];}
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

