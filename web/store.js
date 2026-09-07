const $=s=>document.querySelector(s);
const desktop=!!window.nutty;
let apps=[],kind='all',authMode='login',account=null,current='discover',selectedFile=null,downloadBusy=false;
const titles={discover:'Discover',apps:'Apps',games:'Games',downloads:'Downloads',publish:'Publish an app',settings:'Settings',account:'Nuttyinc account',policy:'Community'};
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,7000);}
function message(selector,text,error=false){const el=$(selector);el.textContent=text;el.classList.toggle('error',error);}
async function api(route,body){
 if(desktop)return window.nutty.api(route,body);
 const response=await fetch(route,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',signal:AbortSignal.timeout(15000)});
 const type=response.headers.get('content-type')||'';
 if(!type.includes('application/json'))throw Error('Nuttyinc accounts need the hosted Aspire website. This static preview does not provide account services.');
 const json=await response.json();if(!response.ok)throw Error(json.error||'Sign in to your Nuttyinc account.');return json;
}
function view(name){
 current=name;document.title=`${titles[name]} — download.net`;$('#view-title').textContent=titles[name];
 document.querySelectorAll('.content > section').forEach(el=>el.hidden=true);
 const catalog=['discover','apps','games'].includes(name);
 $(`#${catalog?'catalog':name}-view`).hidden=false;
 document.querySelectorAll('#main-nav button').forEach(el=>{el.classList.toggle('active',el.dataset.view===name);});
 if(catalog){kind=name==='apps'?'app':name==='games'?'game':'all';renderCatalog();}
 if(name==='publish')$('#publish-requirement').textContent=!desktop?'Use the Windows launcher to select and upload an .exe. You can browse this form here.':account?`Publishing as ${account.name}. Your GitHub account will own the uploaded release.`:'Sign in to your Nuttyinc account before submitting.';
 $('#github-token').value='';
}
function renderCatalog(){
 document.querySelectorAll('[data-kind]').forEach(el=>el.classList.toggle('active',el.dataset.kind===kind));
 const query=$('#search').value.toLowerCase().trim();
 const list=apps.filter(a=>(kind==='all'||a.kind===kind)&&`${a.name} ${a.description} ${a.publisher}`.toLowerCase().includes(query));
 if(!list.length){$('#catalog').innerHTML=`<div class="empty"><div class="app-icon">${apps.length?'⌕':'＋'}</div><h3>${apps.length?'No matches this time.':'A new store starts with its creators.'}</h3><p>${apps.length?'Try a different search or category.':'No approved releases are listed yet. Submit your app or game to be part of the first collection.'}</p><button id="empty-action">${apps.length?'Clear search':'Publish the first app ↗'}</button></div>`;$('#empty-action').onclick=()=>{if(apps.length){$('#search').value='';kind='all';renderCatalog();}else view('publish');};return;}
 $('#catalog').innerHTML=list.map(a=>`<article class="app-card"><div class="app-icon">${escapeHtml(a.name.slice(0,1).toUpperCase())}</div><span class="eyebrow">${escapeHtml(a.kind)}</span><h3>${escapeHtml(a.name)}</h3><span class="tiny">${escapeHtml(a.publisher)} · ${escapeHtml(a.version)}</span><p>${escapeHtml(a.description)}</p><span class="tiny">${(a.size/1024/1024).toFixed(1)} MB · ${escapeHtml(a.license)}</span><button class="primary" data-download="${escapeHtml(a.id)}">↓ Download</button></article>`).join('');
 document.querySelectorAll('[data-download]').forEach(el=>el.onclick=()=>download(el.dataset.download));
}
async function loadCatalog(){
 $('#catalog').innerHTML='<div class="empty" role="status"><h3>Connecting to the catalog…</h3></div>';
 try{
  let data;
  if(desktop)data=await api('/api/apps');
  else{
   try{data=await api('/api/apps');}
   catch{const r=await fetch('https://raw.githubusercontent.com/nuttyinc/download.net/main/catalog/apps.json',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('The reviewed catalog is not published yet.');data={apps:await r.json()};}
  }
  if(!Array.isArray(data.apps))throw Error('Invalid catalog response.');
  apps=data.apps.filter(a=>a&&typeof a.name==='string'&&typeof a.id==='string'&&typeof a.description==='string'&&Number.isFinite(a.size));renderCatalog();
 }catch(e){apps=[];$('#catalog').innerHTML=`<div class="empty"><div class="app-icon">◈</div><h3>The catalog is waiting for a connection.</h3><p>${escapeHtml(e.message)}</p><button id="retry-catalog">Try again</button> <button id="connect-settings">${desktop?'Connect server':'Publish an app'}</button></div>`;$('#retry-catalog').onclick=loadCatalog;$('#connect-settings').onclick=()=>view(desktop?'settings':'publish');}
}
async function refreshAccount(){try{account=await api('/api/auth/me');}catch{account=null;}$('#account-button').textContent=account?account.name:'Sign in ↗';$('#signed-in').hidden=!account;$('#auth-container').hidden=!!account;if(account){$('#account-name').textContent=`${account.name} · ${account.email}`;$('#auth-heading').textContent='You’re signed in.';}}
async function download(id){
 if(!desktop){toast('Open the Windows launcher to download apps through Nuttyinc Bootstrap.');return;}
 if(downloadBusy){view('downloads');return;}
 const item=apps.find(a=>a.id===id);if(!item)return;
 view('downloads');downloadBusy=true;$('#download-name').textContent=item.name;$('#download-progress').value=0;$('#reveal-download').hidden=true;$('#cancel-download').hidden=false;
 try{const result=await window.nutty.download(id);message('#download-status',`Verified and saved: ${result.path}`);$('#reveal-download').hidden=false;}
 catch(e){message('#download-status',e.message,true);}
 finally{downloadBusy=false;$('#cancel-download').hidden=true;}
}
document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>view(el.dataset.view));
document.querySelectorAll('[data-kind]').forEach(el=>el.onclick=()=>{kind=el.dataset.kind;renderCatalog();});
$('#search').oninput=renderCatalog;$('#spotlight-publish').onclick=()=>view('publish');$('#account-button').onclick=()=>view('account');
document.querySelectorAll('[data-auth]').forEach(el=>el.onclick=()=>{authMode=el.dataset.auth;document.querySelectorAll('[data-auth]').forEach(e=>e.classList.toggle('active',e===el));$('#name-label').hidden=authMode!=='signup';$('#name-label input').required=authMode==='signup';$('#auth-heading').textContent=authMode==='signup'?'Make yourself at home.':'Welcome back.';$('#auth-submit').textContent=authMode==='signup'?'Create account →':'Sign in →';$('#auth-form [name=password]').minLength=authMode==='signup'?12:1;$('#auth-form [name=password]').autocomplete=authMode==='signup'?'new-password':'current-password';$('#password-help').textContent=authMode==='signup'?'At least 12 characters.':'Use your Nuttyinc account password.';message('#auth-status','');});
$('#auth-form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));$('#auth-submit').disabled=true;message('#auth-status','Connecting…');try{account=await api(`/api/auth/${authMode}`,data);e.target.reset();await refreshAccount();toast(authMode==='signup'?'Your Nuttyinc account is ready.':'Welcome back.');view('publish');}catch(err){message('#auth-status',err.message,true);}finally{$('#auth-submit').disabled=false;}};
$('#logout').onclick=async()=>{try{await api('/api/auth/logout',{});account=null;await refreshAccount();$('#auth-heading').textContent='Welcome back.';}catch(e){toast(e.message);}};
$('#settings-form').onsubmit=async e=>{e.preventDefault();if(!desktop){message('#settings-status','Set the server address in the Windows launcher. This website uses its own Aspire backend.',true);return;}try{await window.nutty.configure(Object.fromEntries(new FormData(e.target)));message('#settings-status','Connection saved.');await refreshAccount();await loadCatalog();}catch(err){message('#settings-status',err.message,true);}};
$('#choose-exe').onclick=async()=>{if(!desktop){toast('Executable uploads are available in the Windows launcher.');return;}try{selectedFile=await window.nutty.chooseExe();if(selectedFile){$('#selected-file').textContent=`${selectedFile.name} · ${(selectedFile.size/1024/1024).toFixed(1)} MB`;$('#file-hash').textContent=`SHA-256 · ${selectedFile.sha256}`;}}catch(e){toast(e.message);}};
$('#publish-form').onsubmit=async e=>{
 e.preventDefault();if(!desktop){toast('Use the Windows launcher to publish an executable.');return;}if(!account){view('account');return;}if(!selectedFile){toast('Choose an executable first.');return;}
 const fields=Object.fromEntries(new FormData(e.target));let token=$('#github-token').value;$('#github-token').value='';$('#publish-submit').disabled=true;message('#publish-status','Preparing your submission…');
 try{const result=await window.nutty.publish(fields,token);const el=$('#publish-status');el.textContent='Pull request created. ';const a=document.createElement('a');a.href=result.url;a.textContent=`Open review #${result.number} ↗`;a.className='text-link';el.append(a);toast('Your app is waiting for review.');}catch(err){message('#publish-status',err.message,true);}finally{token='';$('#github-token').value='';$('#publish-submit').disabled=false;}
};
$('#cancel-download').onclick=()=>window.nutty?.cancel();$('#reveal-download').onclick=()=>window.nutty?.reveal();
if(desktop){
 window.nutty.onProgress(p=>{if(p.stage==='publishing'){message('#publish-status',p.message);return;}const order=['bootstrap','verification','aspire','downloading','complete'];const step=order.indexOf(p.stage);document.querySelectorAll('.step').forEach((el,i)=>{el.classList.toggle('active',i===step);el.classList.toggle('done',i<step);});const labels={bootstrap:'Connecting to Nuttyinc Bootstrap…',verification:'Verifying the signed bootstrap ticket…',aspire:'Fetching the reviewed app from the Aspire website…',downloading:'Downloading with Node.js…',complete:p.cached?'Using your verified cached download.':'Download verified.'};message('#download-status',(p.stage==='complete'&&p.cached?labels.complete:window.nuttyFlow?.labels?.[p.stage])||labels[p.stage]||p.stage);if(p.total){$('#download-progress').value=p.bytes/p.total*100;if(p.stage==='downloading')message('#download-status',`${(p.bytes/1024/1024).toFixed(1)} / ${(p.total/1024/1024).toFixed(1)} MB`);}});
 window.nutty.settings().then(s=>{for(const key of ['apiUrl','bootstrapUrl'])$(`#settings-form [name=${key}]`).value=s[key]||'';if(!s.apiUrl)view('settings');});
 document.addEventListener('click',e=>{const a=e.target.closest('a');if(a?.href.startsWith('https://')){e.preventDefault();window.nutty.openLink(a.href).catch(err=>toast(err.message));}else if(a&&/\/(conduct|contributing|license)\.html$/.test(a.href)){e.preventDefault();openPolicy(a.href.includes('conduct')?'conduct':a.href.includes('contributing')?'contributing':'license');}else if(a&&a.getAttribute('href')==='index.html'){e.preventDefault();view('discover');}});
}
const policies={
 conduct:{title:'Code of conduct.',body:['Our promise','download.net welcomes people of every background and level of experience. Treat creators, reviewers, and users with patience and respect.','Be constructive','Critique the work without attacking the person. Respect different perspectives, give useful feedback, and help others learn. Do not harass, threaten, discriminate, or share someone’s private information.','Publish responsibly','Only submit software that you own or have permission to distribute. Describe what it does honestly. Disclose network access, advertising, data collection, and paid features. Do not submit malware, credential theft, disguised installers, pirated software, or deceptive content.','Respect review','A submission is a request for review, not a promise of distribution. Do not bypass moderation, replace assets to avoid review, or claim Nuttyinc has certified your software as safe.','Report a problem','Use the repository’s issue tracker for non-sensitive reports. Never post passwords, tokens, private personal information, or exploit secrets in public. For sensitive security reports, use GitHub private vulnerability reporting when enabled.','Enforcement','Maintainers may request changes, reject or remove listings, or restrict participation for violations. They should explain decisions and consider context fairly. Acknowledging this code records your reading on this device; it does not waive your rights.','End of code of conduct.']},
 contributing:{title:'Contributing.',body:['Build something people can trust','Thank you for helping download.net grow. Contributions may include code, documentation, accessibility improvements, bug reports, and Windows app submissions.','Before you begin','Check existing issues and pull requests. Keep changes focused. Follow the MIT license for this launcher and respect the separate license of every third-party app. Never commit secrets or personal access tokens.','Submit your app','Sign in to your Nuttyinc account in the launcher. Choose a Windows .exe, enter an honest description, version, category, and license, then provide your GitHub token. The launcher calculates file size and SHA-256 from the selected file.','Your GitHub token','Your token is used in memory to prepare your fork, create a public prerelease with the .exe asset, and open a pull request in nuttyinc/download.net. It must permit fork creation, release asset uploads, content commits, and pull requests. Revoke it through GitHub settings if you no longer need it.','Review and distribution','Your pull request must pass manifest validation, executable structure inspection, configured AI moderation, and human review. AI reviews listing text, not executable safety. Maintainers verify distribution rights and provenance before merging. Rejected submissions stay out of the catalog.','Update an app','Submit a new version and executable hash for review. Never silently replace an asset. Downloads with a mismatched size or hash are discarded. Maintain backward compatibility when possible and explain breaking changes.','Contribute code','Install Node.js, .NET, Go, and a JDK. Run the documented tests before opening a focused pull request. Do not run submitted executable files during tests or review.','End of contributing guide.']},
 license:{title:'MIT license.',body:['MIT License','Copyright (c) 2026 Nuttyinc','Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:','The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.','THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.','End of license.']}
};
let policyKey='conduct',holdStart=0,holdFrame=0;
function openPolicy(key){policyKey=key;view('policy');$('#policy-heading').textContent=policies[key].title;$('#policy-pane').innerHTML=policies[key].body.map(t=>`<p>${escapeHtml(t)}</p>`).join('');$('#policy-pane').scrollTop=0;$('#policy-hold').disabled=true;$('#policy-hold').textContent='Scroll to the end first';message('#policy-status','');cancelHold();}
document.querySelectorAll('[data-policy]').forEach(el=>el.onclick=()=>openPolicy(el.dataset.policy));
$('#policy-pane').onscroll=()=>{const el=$('#policy-pane');if(el.scrollTop+el.clientHeight>=el.scrollHeight-8){$('#policy-hold').disabled=false;$('#policy-hold').textContent='Hold to acknowledge';}};
function cancelHold(){holdStart=0;cancelAnimationFrame(holdFrame);$('#policy-hold').style.setProperty('--hold','0%');}
function startHold(){if($('#policy-hold').disabled||holdStart)return;holdStart=performance.now();function tick(){if(!holdStart)return;const elapsed=performance.now()-holdStart;$('#policy-hold').style.setProperty('--hold',`${Math.min(100,elapsed/12)}%`);if(elapsed>=1200){cancelHold();$('#policy-hold').textContent='✓ Acknowledged';message('#policy-status',`${policies[policyKey].title} Acknowledged on this device.`);try{localStorage.setItem(`nutty-policy-${policyKey}`,new Date().toISOString());}catch{}return;}holdFrame=requestAnimationFrame(tick);}tick();}
$('#policy-hold').onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);startHold();};
for(const name of ['pointerup','pointercancel','lostpointercapture','blur'])$('#policy-hold').addEventListener(name,cancelHold);
$('#policy-hold').onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)startHold();}};$('#policy-hold').onkeyup=cancelHold;window.addEventListener('blur',cancelHold);
loadCatalog();refreshAccount();

