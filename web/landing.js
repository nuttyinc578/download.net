const button=document.querySelector('#nightly-download');
const agreement=document.querySelector('#license-check');
let ready=false;
agreement.addEventListener('change',()=>{button.disabled=!agreement.checked||!ready;});
button.addEventListener('click',()=>{if(ready&&agreement.checked)location.href='https://nightly.link/nuttyinc/download.net/workflows/nightly.yml/main/download.net-launcher-v1.zip';});
(async()=>{
 const status=document.querySelector('#release-status');
 try{
  const response=await fetch('https://api.github.com/repos/nuttyinc/download.net/actions/workflows/nightly.yml/runs?branch=main&status=success&per_page=1',{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error();
  const data=await response.json();
  if(!data.workflow_runs?.length)throw Error();
  const artifacts=await fetch(`https://api.github.com/repos/nuttyinc/download.net/actions/runs/${data.workflow_runs[0].id}/artifacts`,{signal:AbortSignal.timeout(12000)});
  if(!artifacts.ok)throw Error();
  const available=(await artifacts.json()).artifacts?.some(a=>a.name==='download.net-launcher-v1'&&!a.expired);
  if(!available)throw Error();
  ready=true;status.textContent='A launcher build is available. Read and accept the MIT license to download.';button.disabled=!agreement.checked;
 }catch{status.textContent='The launcher build has not been published yet, or GitHub is unavailable. Check the repository for release status.';}
})();
