const $=s=>document.querySelector(s);
const desktop=!!window.nutty;
let apps=[],kind='all',authMode='login',account=null,current='discover',selectedFile=null,downloadBusy=false;
const titles={discover:'Discover',apps:'Apps',games:'Games',downloads:'Downloads',updates:'Updates',publish:'Publish an app',settings:'Settings',account:'Nuttyinc account',policy:'Community'};
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
let signupConsent=null,authBusy=false;
function view(name){
 if(current==='policy'&&name!=='policy')cancelHold();
 current=name;document.title=`${titles[name]} — download.net`;$('#view-title').textContent=titles[name];
 document.querySelectorAll('.content > section').forEach(el=>el.hidden=true);
 const catalog=['discover','apps','games'].includes(name);
 $(`#${catalog?'catalog':name}-view`).hidden=false;
 document.querySelectorAll('#main-nav button').forEach(el=>{el.classList.toggle('active',el.dataset.view===name);});
 if(catalog){kind=name==='apps'?'app':name==='games'?'game':'all';renderCatalog();}
 if(name==='publish')$('#publish-requirement').textContent=!desktop?'Use the Windows launcher to select and publish an app folder. You can browse this form here.':account?`Publishing as ${account.name}. Your GitHub account will own the uploaded release.`:'Sign in to your Nuttyinc account before submitting.';
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
   catch{const r=await fetch('https://raw.githubusercontent.com/nuttyinc578/download.net/main/catalog/apps.json',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('The reviewed catalog is not published yet.');data={apps:await r.json()};}
  }
  if(!Array.isArray(data.apps))throw Error('Invalid catalog response.');
  apps=data.apps.filter(a=>a&&typeof a.name==='string'&&typeof a.id==='string'&&typeof a.description==='string'&&Number.isFinite(a.size));renderCatalog();
 }catch(e){apps=[];$('#catalog').innerHTML=`<div class="empty"><div class="app-icon">◈</div><h3>The catalog is waiting for a connection.</h3><p>${escapeHtml(e.message)}</p><button id="retry-catalog">Try again</button> <button id="connect-settings">${desktop?'Connection status':'Publish an app'}</button></div>`;$('#retry-catalog').onclick=loadCatalog;$('#connect-settings').onclick=()=>view(desktop?'settings':'publish');}
}
async function refreshAccount(){try{account=await api('/api/auth/me');}catch{account=null;}$('#account-button').textContent=account?account.name:'Sign in ↗';$('#signed-in').hidden=!account;$('#auth-container').hidden=!!account;if(account){$('#account-name').textContent=`${account.name} · ${account.email}`;$('#auth-heading').textContent='You’re signed in.';}}
async function download(id){
 if(!desktop){toast('Open the Windows launcher to download apps through Nuttyinc Bootstrap.');return;}
 if(downloadBusy){view('downloads');return;}
 const item=apps.find(a=>a.id===id);if(!item)return;
 view('downloads');downloadBusy=true;$('#download-name').textContent=item.name;$('#download-progress').value=0;$('#reveal-download').hidden=true;$('#cancel-download').hidden=false;
 try{const result=await window.nutty.download(id);message('#download-status',`Installed ${result.fileCount} files: ${result.path}`);$('#reveal-download').hidden=false;}
 catch(e){message('#download-status',e.message,true);}
 finally{downloadBusy=false;$('#cancel-download').hidden=true;}
}
document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>view(el.dataset.view));
document.querySelectorAll('[data-kind]').forEach(el=>el.onclick=()=>{kind=el.dataset.kind;renderCatalog();});
$('#search').oninput=renderCatalog;$('#spotlight-publish').onclick=()=>view('publish');$('#account-button').onclick=()=>view('account');
function hasSignupConsent(){return !!signupConsent&&$('#signup-conduct-accepted').checked&&signupConsent.version===policies.conduct.version&&signupConsent.sha256===policies.conduct.sha256;}
function updateAuthSubmit(){$('#auth-submit').disabled=authBusy||(authMode==='signup'&&!hasSignupConsent());}
function resetSignupConsent(){signupConsent=null;$('#signup-conduct-accepted').checked=false;$('#signup-conduct-accepted').disabled=true;message('#signup-conduct-status','Required: read to the end and hold to accept.');updateAuthSubmit();}
document.querySelectorAll('[data-auth]').forEach(el=>el.onclick=()=>{if(authBusy)return;authMode=el.dataset.auth;resetSignupConsent();document.querySelectorAll('[data-auth]').forEach(e=>e.classList.toggle('active',e===el));$('#name-label').hidden=authMode!=='signup';$('#name-label input').required=authMode==='signup';$('#signup-conduct').hidden=authMode!=='signup';$('#auth-heading').textContent=authMode==='signup'?'Make yourself at home.':'Welcome back.';$('#auth-submit').textContent=authMode==='signup'?'Create account →':'Sign in →';$('#auth-form [name=password]').minLength=authMode==='signup'?12:1;$('#auth-form [name=password]').autocomplete=authMode==='signup'?'new-password':'current-password';$('#password-help').textContent=authMode==='signup'?'At least 12 characters.':'Use your Nuttyinc account password.';message('#auth-status','');});
$('#read-signup-conduct').onclick=()=>openPolicy('conduct','account');
$('#signup-conduct-accepted').onchange=()=>{if(!$('#signup-conduct-accepted').checked)resetSignupConsent();};
$('#auth-form').onsubmit=async e=>{e.preventDefault();if(authBusy)return;if(authMode==='signup'&&!hasSignupConsent()){message('#auth-status','Read and accept the code of conduct before creating an account.',true);return;}const mode=authMode;const data=Object.fromEntries(new FormData(e.target));if(mode==='signup')Object.assign(data,{acceptedCodeOfConduct:true,codeOfConductVersion:signupConsent.version,codeOfConductSha256:signupConsent.sha256});authBusy=true;updateAuthSubmit();message('#auth-status','Connecting…');try{account=await api('/api/auth/'+mode,data);e.target.reset();resetSignupConsent();await refreshAccount();toast(mode==='signup'?'Your Nuttyinc account is ready.':'Welcome back.');view('publish');}catch(err){message('#auth-status',err.message,true);}finally{authBusy=false;updateAuthSubmit();}};
$('#logout').onclick=async()=>{try{await api('/api/auth/logout',{});account=null;resetSignupConsent();await refreshAccount();$('#auth-heading').textContent='Welcome back.';}catch(e){toast(e.message);}};
$('#choose-install-folder').onclick=async()=>{if(!desktop){toast('Choose your Programs folder in the Windows launcher.');return;}try{const path=await window.nutty.chooseInstallFolder();if(path){$('#install-root').value=path;message('#settings-status','Installation folder saved.');}}catch(e){message('#settings-status',e.message,true);}};
$('#choose-folder').onclick=async()=>{if(!desktop){toast('Folder publishing is available in the Windows launcher.');return;}try{const choice=await window.nutty.chooseFolder();if(choice){selectedFile=choice;$('#selected-file').textContent=`${selectedFile.name} · ${selectedFile.fileCount} files · ${(selectedFile.size/1024/1024).toFixed(1)} MB`;$('#file-hash').textContent='All files and subfolders will be packaged together. Review this folder before publishing.';}}catch(e){toast(e.message);}};
$('#publish-form').onsubmit=async e=>{
 e.preventDefault();if(!desktop){toast('Use the Windows launcher to publish an app folder.');return;}if(!account){view('account');return;}if(!selectedFile){toast('Choose an app folder first.');return;}
 const fields=Object.fromEntries(new FormData(e.target));let token=$('#github-token').value;$('#github-token').value='';$('#publish-submit').disabled=true;message('#publish-status','Preparing your submission…');
 try{const result=await window.nutty.publish(fields,token);const el=$('#publish-status');el.textContent='Pull request created. ';const a=document.createElement('a');a.href=result.url;a.textContent=`Open review #${result.number} ↗`;a.className='text-link';el.append(a);toast('Your app is waiting for review.');}catch(err){message('#publish-status',err.message,true);}finally{token='';$('#github-token').value='';$('#publish-submit').disabled=false;}
};
$('#cancel-download').onclick=()=>window.nutty?.cancel();$('#reveal-download').onclick=()=>window.nutty?.reveal();
function renderUpdate(state){
 const managed=state.mode==='installed';
 $('#update-current').textContent=state.currentVersion;$('#update-latest').textContent=state.latestVersion||'Not checked';
 $('#updates-description').textContent=managed?'New stable releases download automatically and install when you close download.net.':'Use Windows setup to enable automatic updates. Portable editions can check for new releases here.';
 const labels={idle:'Ready to check for a new release.',checking:'Checking GitHub for a new stable release…',available:managed?'A new release is available. Starting the download…':'A new release is available. Open the release page and install setup to enable automatic updates.',current:'You’re running the latest stable version.',downloading:'Downloading the launcher update…',ready:'Update downloaded and verified. Restart now, or close download.net to install it.',installing:'Stopping Nuttyinc and restarting to install the update…',unsupported:'Install download.net using Windows setup to enable automatic updates.',error:state.error};
 message('#update-status',labels[state.phase]||state.phase,state.phase==='error');
 $('#check-updates').disabled=['checking','downloading','ready','installing','unsupported'].includes(state.phase);
 $('#install-update').hidden=!managed||state.phase!=='ready';
 $('#update-progress').hidden=!['downloading','ready'].includes(state.phase);$('#update-progress').value=state.percent||0;
 $('#update-bytes').hidden=state.phase!=='downloading';$('#update-bytes').textContent=(state.transferred/1024/1024).toFixed(1)+' / '+(state.total/1024/1024).toFixed(1)+' MB';
 $('#update-last-checked').textContent=state.lastChecked?'Last checked '+new Date(state.lastChecked).toLocaleString()+'. Checks every 6 hours.':'Checks at startup and every 6 hours while the launcher is open.';
 $('#update-notes').textContent=state.notes||'';$('#update-notes-box').hidden=!state.notes;
 $('#update-badge').hidden=!['available','downloading','ready'].includes(state.phase);
}
$('#check-updates').onclick=async()=>{try{renderUpdate(await window.nutty.checkUpdates());}catch(error){message('#update-status',error.message,true);}};
$('#install-update').onclick=async()=>{try{renderUpdate(await window.nutty.installUpdate());}catch(error){message('#update-status',error.message,true);}};
if(desktop){
 window.nutty.onUpdate(renderUpdate);
 window.nutty.updateState().then(renderUpdate).catch(e=>message('#update-status',e.message,true));
 $('#account-description').textContent='Sign in with the Nuttyinc account stored on this PC to publish your apps and games.';
 window.nutty.onProgress(p=>{if(p.stage==='publishing'){message('#publish-status',p.message);return;}const order=['bootstrap','verification','aspire','downloading','installing','complete'];if(p.stage==='downloaded'){message('#download-status','Package verified. Preparing all files…');return;}const step=order.indexOf(p.stage);document.querySelectorAll('.step').forEach((el,i)=>{el.classList.toggle('active',i===step);el.classList.toggle('done',i<step);});const labels={bootstrap:'Connecting to Nuttyinc Bootstrap…',verification:'Verifying the signed bootstrap ticket…',aspire:'Fetching the reviewed app from the Aspire website…',downloading:'Downloading with Node.js…',installing:'Verifying and installing every file…',complete:p.cached?'App folder already installed and verified.':'All files installed.'};message('#download-status',(p.stage==='complete'&&p.cached?labels.complete:window.nuttyFlow?.labels?.[p.stage])||labels[p.stage]||p.stage);if(p.total){$('#download-progress').value=p.bytes/p.total*100;if(['downloading','installing'].includes(p.stage))message('#download-status',`${(p.bytes/1024/1024).toFixed(1)} / ${(p.total/1024/1024).toFixed(1)} MB`);}});
 window.nutty.settings().then(s=>{ $('#install-root').value=s.installRoot||'';$('#app-version').textContent=`WINDOWS / V${s.version}`;message('#connection-status',s.connected?'Connected automatically. Nuttyinc is running on this PC.':s.connectionError||'Nuttyinc could not start.',!s.connected);}).catch(e=>message('#connection-status',e.message,true));
 window.nutty.onConnectionError(text=>{message('#connection-status',text,true);toast(text);});
 document.addEventListener('click',e=>{const a=e.target.closest('a');if(a?.href.startsWith('https://')){e.preventDefault();window.nutty.openLink(a.href).catch(err=>toast(err.message));}else if(a&&/\/(conduct|contributing|license)\.html$/.test(a.href)){e.preventDefault();openPolicy(a.href.includes('conduct')?'conduct':a.href.includes('contributing')?'contributing':'license');}else if(a&&a.getAttribute('href')==='index.html'){e.preventDefault();view('discover');}});
}
const policies={
 conduct:window.nuttyConduct,
 contributing:{title:'Contributing.',body:['Build something people can trust','Thank you for helping download.net grow. Contributions may include code, documentation, accessibility improvements, bug reports, and Windows app submissions.','Before you begin','Check existing issues and pull requests. Keep changes focused. Follow the MIT license for this launcher and respect the separate license of every third-party app. Never commit secrets or personal access tokens.','Submit your app','Sign in to your Nuttyinc account in the launcher. Choose the complete built app folder, enter an honest description, version, category, and license, then provide your GitHub token. The launcher detects every regular file, preserves subfolders, and builds one .vfdn package with file sizes and SHA-256 hashes. Include DLLs, assets, and configuration; check that the folder contains no private files.','Your GitHub token','Your token is used in memory to prepare a submission branch (in your fork, or directly in the repository if you have write access), create a public prerelease with the complete .vfdn folder package, and open a pull request in nuttyinc578/download.net. It must permit fork creation, release asset uploads, content commits, and pull requests. Revoke it through GitHub settings if you no longer need it.','Review and distribution','A maintainer reviews your submission and merges it to approve publication. The catalog workflow verifies package and file hashes and checks executable structure before listing it. If an AI moderation provider is configured, its listing review must also pass. AI reviews text, not executable safety. Maintainers verify distribution rights and provenance before merging.','Update an app','Submit a new version and package hash for review. Never silently replace an asset. Downloads with a mismatched size or hash are discarded. Maintain backward compatibility when possible and explain breaking changes.','Contribute code','Install Node.js, .NET, Go, and a JDK. Run the documented tests before opening a focused pull request. Do not run submitted executable files during tests or review.','End of contributing guide.']},
 license:{title:'MIT license.',body:['MIT License','Copyright (c) 2026 Nuttyinc','Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:','The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.','THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.','End of license.']}
};
let policyKey='conduct',policyReturnTo=null,holdStart=0,holdFrame=0;
function openPolicy(key,returnTo=null){cancelHold();policyKey=key;policyReturnTo=returnTo;view('policy');$('#policy-heading').textContent=policies[key].title;$('#policy-pane').innerHTML=policies[key].html||policies[key].body.map(t=>'<p>'+escapeHtml(t)+'</p>').join('');$('#policy-pane').scrollTop=0;$('#policy-hold').disabled=true;$('#policy-hold').textContent='Scroll to the end first';$('#policy-back').hidden=!returnTo;$('#policy-instructions').textContent=returnTo?'Read to the end, then hold “I accept” for 1.2 seconds to continue signup.':'Read to the end, then hold the button for 1.2 seconds to acknowledge.';message('#policy-status','');requestAnimationFrame(checkPolicyEnd);}
document.querySelectorAll('[data-policy]').forEach(el=>el.onclick=()=>openPolicy(el.dataset.policy));
$('#policy-back').onclick=()=>{view('account');policyReturnTo=null;};
function checkPolicyEnd(){if(current!=='policy')return;const el=$('#policy-pane');if(el.scrollTop+el.clientHeight>=el.scrollHeight-8){$('#policy-hold').disabled=false;$('#policy-hold').textContent=policyReturnTo?'Hold — I accept':'Hold to acknowledge';}}
$('#policy-pane').onscroll=checkPolicyEnd;
function cancelHold(){holdStart=0;cancelAnimationFrame(holdFrame);$('#policy-hold').style.setProperty('--hold','0%');}
function startHold(){if($('#policy-hold').disabled||holdStart||current!=='policy')return;holdStart=performance.now();function tick(){if(!holdStart||current!=='policy')return;const elapsed=performance.now()-holdStart;$('#policy-hold').style.setProperty('--hold',Math.min(100,elapsed/12)+'%');if(elapsed>=1200){cancelHold();if(policyKey==='conduct'&&policyReturnTo==='account'&&authMode==='signup'){signupConsent={version:policies.conduct.version,sha256:policies.conduct.sha256};$('#signup-conduct-accepted').disabled=false;$('#signup-conduct-accepted').checked=true;message('#signup-conduct-status','Accepted. You can now create your account.');policyReturnTo=null;view('account');updateAuthSubmit();$('#auth-submit').focus();}else{$('#policy-hold').textContent='✓ Acknowledged';message('#policy-status',policies[policyKey].title+' Acknowledged on this device.');}return;}holdFrame=requestAnimationFrame(tick);}tick();}
$('#policy-hold').onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);startHold();};
for(const name of ['pointerup','pointercancel','lostpointercapture','blur'])$('#policy-hold').addEventListener(name,cancelHold);
$('#policy-hold').onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)startHold();}};$('#policy-hold').onkeyup=cancelHold;window.addEventListener('blur',cancelHold);
if(!desktop){$('#updates-description').textContent='Install the Windows launcher to receive automatic updates. This website always shows its published version.';$('#update-current').textContent='Website';$('#update-latest').textContent='View release';$('#check-updates').disabled=true;message('#update-status','Launcher updates are available inside the Windows app.');}
if(!desktop)message('#connection-status','The Windows launcher starts Nuttyinc automatically. This website connects to its own hosted backend.');
loadCatalog();refreshAccount();
