const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const yaml=require('js-yaml');
async function verifyUpdateArtifacts(folder=path.resolve('artifacts'),version=require('../package.json').version){
 const metadata=yaml.load(fs.readFileSync(path.join(folder,'latest.yml'),'utf8'));
 const name='download.net-Setup-'+version+'.exe';
 assert.equal(metadata.version,version,'update metadata version');assert.equal(metadata.files.length,1,'one Windows x64 installer');
 const entry=metadata.files[0];assert.equal(entry.url,name,'installer URL');assert.equal(metadata.path,name);
 const installer=path.join(folder,name);assert.equal(entry.size,fs.statSync(installer).size);
 const hash=createHash('sha512');for await(const chunk of fs.createReadStream(installer))hash.update(chunk);
 const actual=hash.digest('base64');assert.equal(entry.sha512,actual,'installer integrity hash');assert.equal(metadata.sha512,actual,'legacy integrity hash');
 assert.ok(fs.statSync(installer+'.blockmap').size>0,'differential update blockmap');
 console.log('PASS: update metadata identifies version '+version+' and matches the installer bytes.');return metadata;
}
module.exports={verifyUpdateArtifacts};
if(require.main===module)verifyUpdateArtifacts().catch(error=>{console.error(error);process.exitCode=1;});
