import {mkdir,writeFile} from 'node:fs/promises';
// Deterministic installer branding, using typography-free geometric interface marks.
const w=164,h=314,stride=Math.ceil(w*3/4)*4,pixels=Buffer.alloc(stride*h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 let rgb=[16,18,15];
 const line=(x===18||x===145||y===20||y===293);if(line)rgb=[49,61,35];
 const stem=x>=77&&x<=85&&y>=88&&y<=158;
 const arrow=y>=137&&y<=174&&Math.abs(x-81)>=Math.max(0,164-y-4)&&Math.abs(x-81)<=Math.max(0,174-y+4);
 const base=y>=191&&y<=198&&x>=45&&x<=118;
 if(stem||arrow||base)rgb=[201,246,91];
 const i=(h-1-y)*stride+x*3;pixels[i]=rgb[2];pixels[i+1]=rgb[1];pixels[i+2]=rgb[0];
}
const header=Buffer.alloc(54);header.write('BM');header.writeUInt32LE(54+pixels.length,2);header.writeUInt32LE(54,10);header.writeUInt32LE(40,14);header.writeInt32LE(w,18);header.writeInt32LE(h,22);header.writeUInt16LE(1,26);header.writeUInt16LE(24,28);header.writeUInt32LE(pixels.length,34);
await mkdir('installer',{recursive:true});await writeFile('installer/sidebar.bmp',Buffer.concat([header,pixels]));
