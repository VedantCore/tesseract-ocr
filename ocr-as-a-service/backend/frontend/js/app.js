const $=id=>document.getElementById(id);
const S={file:null,url:null,base:'',text:'',json:'',tab:'text',busy:false,accuracy:null};
const store={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
const norm=u=>{u=(u||'').trim().replace(/\/+$/,'');return u&&!/^https?:\/\//.test(u)?'http://'+u:u};
const fmt=b=>b<1048576?(b/1024).toFixed(0)+' KB':(b/1048576).toFixed(1)+' MB';

/* theme */
function setTheme(t){document.documentElement.dataset.theme=t;$('themeUse').setAttribute('href',t==='dark'?'#su':'#mo');store.set('theme',t)}
const dark=matchMedia('(prefers-color-scheme: dark)').matches;
setTheme(store.get('theme')||(dark?'dark':'light'));
$('theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');

/* connection */
function pill(state,txt){$('dot').className='dot '+state;$('pillTxt').textContent=txt}
async function probe(base){try{const c=new AbortController(),t=setTimeout(()=>c.abort(),3000);const r=await fetch(base+'/health',{signal:c.signal});clearTimeout(t);const j=await r.json();return r.ok&&j.status==='ok'}catch(e){return false}}
async function connect(candidates){
  pill('wait','Checking…');
  for(const b of candidates){if(await probe(b)){setBase(b);pill('ok','Connected');return true}}
  setBase(candidates[0]);pill('bad','Unreachable');return false}
function setBase(b){S.base=b;$('base').value=b;store.set('base',b);$('curl').textContent=`curl -X POST \\\n  -F "image=@photo.png" \\\n  ${b}/ocr`}
const menu=$('menu'),pb=$('pillBtn');
function toggleMenu(o){menu.hidden=!o;pb.setAttribute('aria-expanded',o);if(o)$('base').focus()}
pb.onclick=e=>{e.stopPropagation();toggleMenu(menu.hidden)};
document.addEventListener('click',e=>{if(!menu.hidden&&!menu.contains(e.target))toggleMenu(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){toggleMenu(false);pb.focus()}});
$('saveBase').onclick=async()=>{const b=norm($('base').value);if(b){await connect([b]);}};
$('base').onkeydown=e=>{if(e.key==='Enter')$('saveBase').click()};
const saved=store.get('base');
const sameOrigin=location.protocol.startsWith('http')?location.origin:'';
connect([...new Set([saved,sameOrigin,'http://localhost:5002','http://localhost:5000','http://localhost:5001'].filter(Boolean))]);
addEventListener('focus',()=>{if(S.base)probe(S.base).then(ok=>pill(ok?'ok':'bad',ok?'Connected':'Unreachable'))});

/* file handling */
const drop=$('drop'),fileIn=$('file');
function fileErr(m){$('fileErr').hidden=!m;$('fileErr').textContent=m||''}
function pick(f){
  fileErr();
  if(!f)return;
  if(!f.type.startsWith('image/'))return fileErr('That file is not an image. Choose a PNG, JPG or WebP.');
  if(f.size>10485760)return fileErr(`That file is ${fmt(f.size)}. Keep uploads under 10 MB for a quick response.`);
  if(S.url)URL.revokeObjectURL(S.url);
  S.file=f;S.url=URL.createObjectURL(f);
  const im=$('img');im.src=S.url;im.onload=()=>{$('fm').textContent=`${im.naturalWidth} × ${im.naturalHeight} · ${fmt(f.size)}`};
  $('fn').textContent=f.name||'Pasted image';$('fm').textContent=fmt(f.size);
  drop.hidden=true;$('prev').hidden=false;$('go').disabled=false;$('hintGo').textContent='Ready to extract';
  resetOut()}
function clearFile(){if(S.url)URL.revokeObjectURL(S.url);S.file=S.url=null;fileIn.value='';drop.hidden=false;$('prev').hidden=true;$('go').disabled=true;$('hintGo').textContent='Select an image to begin';fileErr();resetOut()}
drop.onclick=()=>fileIn.click();
drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fileIn.click()}};
$('replace').onclick=()=>fileIn.click();$('clear').onclick=clearFile;
fileIn.onchange=()=>pick(fileIn.files[0]);
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>pick(e.dataTransfer.files[0]));
addEventListener('dragover',e=>e.preventDefault());addEventListener('drop',e=>e.preventDefault());
document.addEventListener('paste',e=>{const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));if(it)pick(it.getAsFile())});

/* output */
const body=$('outBody');
function resetOut(){S.text=S.json='';$('copy').disabled=$('dl').disabled=true;$('meta').textContent=S.file?'Ready':'Waiting for an image';
  S.accuracy=null;$('accuracy').hidden=true;
  body.innerHTML='<div class="empty"><svg class="i" style="width:20px;height:20px"><use href="#tx"/></svg><strong>No text yet</strong><span>Results appear here after you extract an image.</span></div>'}
function showResult(){
  if(!S.text.trim()&&S.tab==='text'){body.innerHTML='<div class="empty"><strong>No text found in this image</strong><span>Try a sharper image with higher contrast, or crop closer to the text.</span></div>';return}
  body.innerHTML='';const d=document.createElement('div');d.className='out reveal'+(S.tab==='json'?' json':'');d.tabIndex=0;d.setAttribute('role','region');d.setAttribute('aria-label',S.tab==='json'?'Response JSON':'Extracted text');d.textContent=S.tab==='json'?S.json:S.text;body.appendChild(d)}
function showError(t,m,hint){
  S.accuracy=null;$('accuracy').hidden=true;
  body.innerHTML=`<div class="fail" role="alert"><svg class="i"><use href="#al"/></svg><div><b></b><p></p>${hint?'<code></code>':''}</div></div>`;
  body.querySelector('b').textContent=t;body.querySelector('p').textContent=m;if(hint)body.querySelector('code').textContent=hint;
  $('meta').textContent='Extraction failed'}
function setTab(t){S.tab=t;$('tT').setAttribute('aria-selected',t==='text');$('tJ').setAttribute('aria-selected',t==='json');$('tT').tabIndex=t==='text'?0:-1;$('tJ').tabIndex=t==='json'?0:-1;if(S.json)showResult()}
$('tT').onclick=()=>setTab('text');$('tJ').onclick=()=>setTab('json');
document.querySelector('.tabs').onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const t=S.tab==='text'?'json':'text';setTab(t);$(t==='text'?'tT':'tJ').focus()}};

async function extract(){
  if(!S.file||S.busy)return;
  S.busy=true;const go=$('go');go.disabled=true;go.innerHTML='<span class="spin"></span>Extracting…';$('hintGo').textContent='Running Tesseract in the container';
  body.innerHTML='<div class="sk" aria-label="Extracting text"><i style="width:92%"></i><i style="width:78%"></i><i style="width:85%"></i><i style="width:55%"></i></div>';$('meta').textContent='Processing…';
  const fd=new FormData();fd.append('image',S.file);const c=new AbortController(),to=setTimeout(()=>c.abort(),60000),t0=performance.now();
  try{
    const r=await fetch(S.base+'/ocr',{method:'POST',body:fd,signal:c.signal});
    let j=null;try{j=await r.json()}catch(e){}
    if(!r.ok||!j||typeof j.extracted_text!=='string'){showError('The service returned an error',(j&&j.error)||`Unexpected response (HTTP ${r.status}). Check the container logs with docker logs.`);pill('ok','Connected')}
    else{const ms=Math.round(performance.now()-t0);S.text=j.extracted_text.trim();S.accuracy=typeof j.accuracy==='number'?j.accuracy:null;S.json=JSON.stringify(j,null,2);
      if(S.accuracy!==null){
        $('accuracyValue').textContent=`${S.accuracy.toFixed(S.accuracy%1?1:0)}%`;
        $('accuracy').hidden=false;
        $('accuracy').dataset.level=S.accuracy>=85?'high':S.accuracy>=65?'medium':'low';
      }
      showResult();$('copy').disabled=$('dl').disabled=!S.text;
      const w=S.text?S.text.split(/\s+/).length:0;$('meta').textContent=`${S.text.length} characters · ${w} words · ${ms} ms`;pill('ok','Connected')}
  }catch(e){
    if(e.name==='AbortError')showError('The request timed out','The service did not answer within 60 seconds. Try a smaller image.');
    else{showError("Can't reach the OCR service",`Nothing answered at ${S.base}. Check that the Compose service is running and the port matches the endpoint above.`,'docker compose up --build');pill('bad','Unreachable')}
  }finally{clearTimeout(to);S.busy=false;go.disabled=!S.file;go.textContent='Extract text';$('hintGo').textContent='Ready to extract'}}
$('go').onclick=extract;
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')extract()});

/* copy + download */
async function copy(text,btn,use,txt){try{await navigator.clipboard.writeText(text)}catch(e){const a=document.createElement('textarea');a.value=text;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove()}
  const u=use&&$(use),t=txt&&$(txt),old=t?t.textContent:'';if(u)u.setAttribute('href','#ck');if(t)t.textContent='Copied';setTimeout(()=>{if(u)u.setAttribute('href','#cp');if(t)t.textContent=old},1600)}
$('copy').onclick=()=>copy(S.tab==='json'?S.json:S.text,null,'copyUse','copyTxt');
$('copyCurl').onclick=()=>copy($('curl').textContent);
$('dl').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([S.text],{type:'text/plain'}));a.download=(S.file?S.file.name.replace(/\.[^.]+$/,''):'extracted')+'.txt';a.click();URL.revokeObjectURL(a.href)};