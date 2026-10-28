import { escapeHTML as e, fileType, sizeLabel, validateFile, normalizeMime } from './core.js';
import {refreshSession,sessionFromResponse} from './auth.js';
const cfg = window.SENDFILE_CONFIG;
const configuredBackend = Boolean(cfg.supabaseUrl && cfg.publishableKey);
const live = configuredBackend && (cfg.demoMode === false || new URLSearchParams(location.search).get('mode') === 'live' || new URLSearchParams(location.hash.slice(1)).has('send'));
const icons = {
 send:'<path d="m4 11 16-7-7 16-2-7-7-2Z"/><path d="m11 13 9-9"/>',
 upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
 folder:'<path d="M3 7V5h7l2 3h9v12H3Z"/>',
 files:'<path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8M8 16h5"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4c2 0 3 2 3 4v2"/>',
 settings:'<path d="m10 3-.7 3-2.6 1-2.7-.7-2 3 2 2v2l-2 2 2 3 2.7-.7 2.6 1 .7 3h4l.7-3 2.6-1 2.7.7 2-3-2-2v-2l2-2-2-3-2.7.7-2.6-1L14 3Z"/><circle cx="12" cy="12" r="3"/>',
 camera:'<path d="M3 7h5l2-3h4l2 3h5v14H3Z"/><circle cx="12" cy="13" r="4"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 building:'<path d="M4 21V3h12v18m0-12h4v12M8 7h4M8 11h4M8 15h4m-2 6v-3"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 link:'<path d="m9 15 6-6m-7 4-2 2a3 3 0 0 0 4 4l3-3m-2-8 3-3a3 3 0 0 1 4 4l-2 2"/>',
 drive:'<path d="m9 3 6 0 7 13-3 5H5l-3-5L9 3Z"/><path d="m9 3 10 18M15 3 5 21M2 16h20"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 external:'<path d="M14 3h7v7m0-7L10 14M9 3H3v18h18v-6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 logout:'<path d="M10 3H3v18h7m5-14 5 5-5 5m-7-5h12"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.files}</svg>`;
const $ = selector => document.querySelector(selector);
const state = {
 view:'upload', queue:[], sending:false, period:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).replace('/', '-'),
 category:'เอกสารทั่วไป', note:'', search:'', filter:'all', customer:null, portalError:null,
 customers:[], documents:[], driveReady:false, driveStatus:null, loading:false,
 session:null,
};
// Month inputs require YYYY-MM regardless of browser date locale.
state.period = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date());
try { state.session = JSON.parse(sessionStorage.getItem('sendfile-admin') || 'null'); } catch {}
const fragment = new URLSearchParams(location.hash.slice(1));
const portalToken = fragment.get('send');
const customerOnly = Boolean(portalToken);
const demoCustomers = [
 {id:'demo-1',name:'บริษัท ตัวอย่าง สตูดิโอ จำกัด',code:'SF-001',drive_folder_id:null},
 {id:'demo-2',name:'บริษัท กรีนเดย์ จำกัด',code:'SF-002',drive_folder_id:null},
 {id:'demo-3',name:'ร้านบ้านกาแฟ',code:'SF-003',drive_folder_id:null},
];
if (!live) state.customers = structuredClone(demoCustomers);
function toast(message) {
 $('#toast').textContent = message; $('#toast').classList.add('show');
 clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);
}
let renewingSession=null;
async function renewSession(){
 if(!renewingSession)renewingSession=refreshSession(cfg,state.session).then(session=>{state.session=session;sessionStorage.setItem('sendfile-admin',JSON.stringify(session));}).catch(error=>{state.session=null;state.customers=[];state.documents=[];sessionStorage.removeItem('sendfile-admin');throw error;}).finally(()=>{renewingSession=null;});
 return renewingSession;
}
function showApiError(error){
 if(live&&!state.session&&!customerOnly){if($('#modal').open)$('#modal').close();render();}
 toast(error.message);
}
async function api(op, data={}) {
 if(state.session?.refresh_token&&state.session.expires_at<Date.now()/1000+30)await renewSession();
 const send=()=>{const headers={'Content-Type':'application/json',apikey:cfg.publishableKey};if(state.session?.access_token)headers.Authorization=`Bearer ${state.session.access_token}`;return fetch(`${cfg.supabaseUrl}/functions/v1/${cfg.functionName}`,{method:'POST',headers,body:JSON.stringify({op,...data})});};
 let res=await send();
 if(res.status===401&&state.session){await renewSession();res=await send();}
 const result=await res.json().catch(()=>({error:'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'}));
 if(!res.ok) throw new Error(result.error || 'เชื่อมต่อไม่สำเร็จ');
 return result;
}
function shell(body) {
 const navs=customerOnly ? [['upload','upload','ส่งเอกสาร']] : [['upload','upload','ส่งเอกสาร'],['documents','files','เอกสารทั้งหมด'],['customers','users','ลูกค้า'],['settings','settings','การเชื่อมต่อ']];
 return `<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-icon">${icon('send')}</span>sendfile<span style="color:#9587e0">.</span></div><div class="workspace"><span class="workspace-avatar">S</span><div><b>พื้นที่รับเอกสาร</b><small>Client document workspace</small></div></div><p class="nav-label">WORKSPACE</p><nav class="nav" aria-label="เมนูหลัก">${navs.map(([view,ico,label])=>`<button data-view="${view}" class="${state.view===view?'active':''}">${icon(ico)}${label}${view==='documents'?`<span class="count">${state.documents.length}</span>`:''}</button>`).join('')}</nav><div class="side-bottom"><div class="drive-mini"><div class="row"><span class="drive-symbol">${icon('drive')}</span>Google Drive</div><p>${state.driveReady?'พร้อมรับไฟล์เข้า sendfile':'รอเชื่อมต่อบัญชีเจ้าของ Drive'}</p></div><p class="side-footer">A little less paperwork.</p></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">พื้นที่ทำงาน ${icon('chevron')} <strong>${navs.find(n=>n[0]===state.view)?.[2]||'ส่งเอกสาร'}</strong></div><div class="row"><span class="mode-pill">${live ? state.driveReady?'พร้อมรับเอกสาร':'กำลังตั้งค่าระบบ':'โหมดทดลอง · ยังไม่ส่งเข้า Drive'}</span>${state.session?`<button class="icon-button" id="logout" aria-label="ออกจากระบบ">${icon('logout')}</button>`:''}<span class="user-avatar">SF</span></div></header><div class="content">${body}<footer class="page-footer"><span><b>sendfile.</b> &nbsp; เอกสารครบ งานเดินต่อ</span><span>${icon('lock').replace('<svg','<svg style="width:11px;height:11px;vertical-align:middle"')} ลิงก์ส่งเอกสารแยกลูกค้า</span></footer></div></main></div>`;
}
function heading(kicker,title,subtitle,action='') {
 return `<div class="page-head"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${action}</div>`;
}
function demoNotice(){return !live?`<div class="notice">${icon('info')}<span>นี่คือพื้นที่ทดลอง เลือกไฟล์และลองขั้นตอนส่งได้ แต่ยังไม่มีการอัปโหลดหรือเก็บไฟล์จริง ข้อมูลจะหายเมื่อปิดหรือรีเฟรชหน้านี้</span></div>`:'';}
function render() {
 let body;
 if(state.view==='upload') body=uploadView();
 else if(live&&!state.session) body=loginView();
 else if(state.view==='documents') body=documentsView();
 else if(state.view==='customers') body=customersView();
 else body=settingsView();
 $('#app').innerHTML=shell(body); bind(); renderQueue();
}
function uploadView() {
 if(state.portalError) return `<div class="card error-state">${icon('lock')}<h1>เปิดลิงก์นี้ไม่ได้</h1><p>${e(state.portalError)}</p><p>กรุณาติดต่อผู้ดูแลเพื่อขอลิงก์ส่งเอกสารใหม่</p></div>`;
 const c=state.customer || (!live?state.customers[0]:null);
 if(live&&!c) return heading('CLIENT PORTAL','ส่งเอกสารได้ในไม่กี่ขั้นตอน','ใช้ลิงก์ส่วนตัวที่ได้รับจากผู้ดูแลเพื่อส่งเอกสาร')+`<div class="card empty-state">${state.loading?'กำลังตรวจสอบลิงก์…':'หน้านี้ต้องเปิดผ่านลิงก์ของลูกค้า หากเป็นผู้ดูแล ให้เลือกเมนู “ลูกค้า” เพื่อสร้างลิงก์'}</div>`;
 return heading('CLIENT PORTAL','ส่งเอกสารให้ง่ายขึ้น','รวมไฟล์และรูปถ่ายไว้ที่เดียว พร้อมส่งต่อให้ผู้ดูแลของคุณ',`<span class="small-link">${icon('lock')} พื้นที่ส่งเอกสารส่วนตัว</span>`)+demoNotice()+`<div class="portal-layout"><section class="card"><div class="card-head"><div class="company"><div class="company-icon">${icon('building')}</div><div><h3>${e(c?.name)}</h3><p>${e(c?.code || '')} &nbsp; / &nbsp; กล่องรับเอกสาร</p></div></div><span class="tag ${live?'':'gray'}">${icon('check').replace('<svg','<svg style="width:12px;height:12px"')} ${live?'ลิงก์พร้อมใช้งาน':'ข้อมูลตัวอย่าง'}</span></div><div class="upload-body"><div class="field-row"><div class="field"><label for="period">เอกสารประจำเดือน</label><input id="period" type="month" value="${e(state.period)}" required></div><div class="field"><label for="category">ประเภทเอกสาร</label><select id="category">${['เอกสารทั่วไป','รายจ่าย / บิลซื้อ','รายรับ / บิลขาย','รายการเดินบัญชี','เอกสารอื่น ๆ'].map(x=>`<option ${x===state.category?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="dropzone" id="dropzone"><div class="upload-illustration">${icon('upload')}</div><h3>วางไฟล์ของคุณตรงนี้ได้เลย</h3><p>หรือเลือกไฟล์และถ่ายรูปจากมือถือ</p><div class="row"><button class="btn primary" id="choose-files">${icon('plus')}เลือกไฟล์</button><button class="btn" id="take-photo">${icon('camera')}ถ่ายรูป</button></div><input id="file-input" type="file" multiple hidden><input id="camera-input" type="file" accept="image/*" capture="environment" hidden></div><div class="format-row">${['HEIC','JPG','PNG','PDF','+ อื่น ๆ'].map(x=>`<span class="format-chip">${x}</span>`).join('')}<span>สูงสุด 20 MB / ไฟล์</span></div><div class="section-label">ไฟล์ที่เลือก <span id="queue-summary"></span></div><div class="queue" id="queue"></div><div class="field"><label for="note">ฝากข้อความถึงผู้ดูแล <span style="color:var(--muted);font-weight:400">(ไม่บังคับ)</span></label><textarea id="note" rows="2" maxlength="1000" placeholder="เช่น เอกสารเพิ่มเติมของเดือนนี้…">${e(state.note)}</textarea></div></div><div class="upload-footer"><p>${icon('lock')}ไฟล์ต้นฉบับจะไม่ถูกแปลง</p><button class="btn primary" id="send-files">${icon('send')}<span>ส่งเอกสาร</span></button></div></section><aside class="right-stack"><section class="card tip-card"><div class="icon-box">${icon('files')}</div><h2>เอกสารครบ ใน 3 ขั้นตอน</h2><div class="steps">${[['เลือกหรือถ่ายรูป','รวมเอกสารที่ต้องการส่ง เลือกได้หลายไฟล์พร้อมกัน'],['ตรวจสอบไฟล์','เลือกเดือนและประเภทเอกสาร พร้อมฝากข้อความ'],['กดส่งเอกสาร','รอจนทุกรายการแสดงว่าส่งสำเร็จ แล้วปิดหน้านี้ได้เลย']].map(([t,d],i)=>`<div class="step"><span class="step-num">0${i+1}</span><div><b>${t}</b><p>${d}</p></div></div>`).join('')}</div><div class="hint">${icon('camera')}<span>ถ่ายให้เห็นเอกสารครบทั้งใบ ตัวหนังสือชัด และมีแสงเพียงพอ</span></div></section><section class="original"><h3>${icon('folder')}เก็บต้นฉบับอย่างครบถ้วน</h3><p>รองรับ HEIC จาก iPhone และไฟล์ประเภทอื่น ๆ แม้บางไฟล์จะไม่มีภาพตัวอย่างในเบราว์เซอร์</p></section></aside></div>`;
}
function renderQueue() {
 if(!$('#queue')) return;
 $('#queue-summary').textContent=`${state.queue.length} ไฟล์ · ${sizeLabel(state.queue.reduce((n,q)=>n+q.file.size,0))}`;
 $('#queue').innerHTML=state.queue.length?state.queue.map(q=>`<div class="file-row"><div class="file-icon ${fileType(q.file.name)==='PDF'?'pdf':''}">${q.preview?`<img src="${q.preview}" alt="">`:e(fileType(q.file.name))}</div><div class="file-meta"><b>${e(q.file.name)}</b><small>${sizeLabel(q.file.size)}${q.error?' · '+e(q.error):''}</small>${q.status==='sending'?`<div class="progress"><span style="width:${q.progress}%"></span></div>`:''}</div><span class="tag ${q.status==='sent'?'':q.status==='error'?'amber':q.status==='demo'?'purple':'gray'}">${({selected:'พร้อมส่ง',sending:`${q.progress}%`,sent:'ส่งสำเร็จ',error:'ลองใหม่',demo:'ทดลองแล้ว'})[q.status]}</span>${['selected','error'].includes(q.status)&&!state.sending?`<button class="icon-button" data-remove="${q.id}" aria-label="นำ ${e(q.file.name)} ออก">${icon('close')}</button>`:''}</div>`).join(''):`<div class="empty-queue">${icon('files')}ยังไม่มีไฟล์ที่เลือก</div>`;
 const pending=state.queue.filter(q=>['selected','error'].includes(q.status)).length;
 $('#send-files').disabled=state.sending||!pending;
 $('#send-files span').textContent=state.sending?'กำลังส่ง…':pending?`${live?'ส่งเอกสาร':'ทดลองส่ง'} ${pending} ไฟล์`:'ส่งเอกสาร';
 $('#choose-files').disabled=state.sending; $('#take-photo').disabled=state.sending;
 for(const selector of ['#period','#category','#note']) if($(selector)) $(selector).disabled=state.sending;
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
  const q=state.queue.find(q=>q.id===b.dataset.remove); if(q.preview) URL.revokeObjectURL(q.preview);
  state.queue=state.queue.filter(q=>q.id!==b.dataset.remove);renderQueue();
 });
}
function addFiles(files) {
 if(state.sending) return;
 const errors=[];
 for(const file of files){
  const err=validateFile(file); if(err){errors.push(`${file.name}: ${err}`);continue;}
  if(state.queue.length>=40){errors.push('เลือกได้ไม่เกิน 40 ไฟล์ต่อครั้ง');break;}
  if(state.queue.some(q=>q.file.name===file.name&&q.file.size===file.size&&q.file.lastModified===file.lastModified)){errors.push(`${file.name}: เลือกไฟล์นี้ไว้แล้ว`);continue;}
  const preview=/^image\/(jpeg|png|webp|gif)$/.test(file.type)?URL.createObjectURL(file):null;
  state.queue.push({id:crypto.randomUUID(),file,preview,status:'selected',progress:0});
 }
 renderQueue();if(errors.length) toast(errors.slice(0,2).join(' · '));
}
function putFile(url,q) {
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.setRequestHeader('Content-Type',normalizeMime(q.file.name,q.file.type));
  xhr.upload.onprogress=event=>{if(event.lengthComputable){q.progress=Math.min(99,Math.round(event.loaded/event.total*100));renderQueue();}};
  xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('อัปโหลดไป Drive ไม่สำเร็จ กรุณาลองอีกครั้ง'));
  xhr.onerror=()=>reject(new Error('เครือข่ายขัดข้อง กรุณาลองอีกครั้ง'));xhr.ontimeout=()=>reject(new Error('การอัปโหลดใช้เวลานานเกินไป'));xhr.timeout=180000;
  xhr.send(q.file);
 });
}
async function sendFiles(){
 if(state.sending)return;
 if(!/^\d{4}-\d{2}$/.test(state.period)){toast('กรุณาเลือกเดือนของเอกสาร');return;}
 const pending=state.queue.filter(q=>['selected','error'].includes(q.status)); if(!pending.length)return;
 state.sending=true;renderQueue();let success=0;
 for(const q of pending){
  q.status='sending';q.error='';q.progress=0;renderQueue();
  try{
   if(live){
    // A completed Drive transfer can be verified again without sending another copy.
    if(!q.uploaded){
     const init=await api('upload-init',{token:portalToken,name:q.file.name,size:q.file.size,mime:normalizeMime(q.file.name,q.file.type),period:state.period,category:state.category,note:state.note});
     q.documentId=init.document_id;await putFile(init.upload_url,q);q.uploaded=true;
    }
    await api('upload-complete',{token:portalToken,document_id:q.documentId});q.status='sent';
   }else{q.progress=100;q.status='demo';}
   success++;
  }catch(err){q.status='error';q.error=err.message;}
  renderQueue();
 }
 state.sending=false;renderQueue();toast(live?`ส่งสำเร็จ ${success} จาก ${pending.length} ไฟล์`:`ทดลองครบ ${success} ไฟล์ · ยังไม่ได้ส่งหรือบันทึกไฟล์จริง`);
}
function loginView(){
 return heading('ADMIN WORKSPACE','พื้นที่สำหรับผู้ดูแล','เข้าสู่ระบบเพื่อจัดการลูกค้าและเอกสาร')+`<form class="card login" id="login-form"><h2>เข้าสู่ระบบ Sendfile</h2><p class="subtitle">เฉพาะบัญชีที่ได้รับสิทธิ์ผู้ดูแล Sendfile</p><div class="field"><label for="email">อีเมล</label><input id="email" type="email" required autocomplete="username"></div><div class="field"><label for="password">รหัสผ่าน</label><input id="password" type="password" required autocomplete="current-password"></div><button class="btn primary" type="submit">เข้าสู่ระบบ</button><p class="subtitle" id="login-error" role="alert"></p></form>`;
}
function documentsView(){
 const docs=state.documents.filter(d=>(`${d.original_name} ${d.customer_name} ${d.category}`.toLowerCase().includes(state.search.toLowerCase()))&&(state.filter==='all'||d.status===state.filter));
 return heading('DOCUMENT INBOX','เอกสารทั้งหมด','รวมเอกสารจากลูกค้า พร้อมติดตามสถานะการรับไฟล์')+demoNotice()+`<div class="stats"><div class="card stat"><small>เอกสารทั้งหมด</small><strong>${state.documents.length}</strong><p>${live?'รายการในระบบ':'ยังไม่มีเอกสารจริง'}</p></div><div class="card stat"><small>ส่งเข้า Drive สำเร็จ</small><strong>${state.documents.filter(d=>d.status==='completed').length}</strong><p>เก็บต้นฉบับเรียบร้อย</p></div><div class="card stat"><small>ลูกค้า</small><strong>${state.customers.length}</strong><p>${live?'กล่องรับเอกสาร':'ลูกค้าตัวอย่าง'}</p></div></div><section class="card"><div class="toolbar"><input class="search" id="search" type="search" aria-label="ค้นหาเอกสาร" placeholder="ค้นหาชื่อไฟล์ หรือลูกค้า…" value="${e(state.search)}"><select id="status-filter" class="search" style="max-width:180px" aria-label="กรองสถานะ"><option value="all">ทุกสถานะ</option><option value="completed" ${state.filter==='completed'?'selected':''}>รับไฟล์สำเร็จ</option><option value="pending" ${state.filter==='pending'?'selected':''}>รอส่งไฟล์</option></select><button class="btn ghost" id="refresh">${icon('clock')}รีเฟรช</button></div><div class="table-wrap"><table><thead><tr><th>ชื่อไฟล์</th><th>ลูกค้า / เดือน</th><th>ประเภทเอกสาร</th><th>สถานะ</th><th>เปิดไฟล์</th></tr></thead><tbody>${docs.map(d=>`<tr><td><div class="table-file"><span class="file-icon">${e(fileType(d.original_name))}</span><div>${e(d.original_name)}<small>${sizeLabel(d.size_bytes)}</small></div></div></td><td>${e(d.customer_name)}<br><small style="color:var(--muted)">${e(d.period)}</small></td><td>${e(d.category)}</td><td><span class="tag ${d.status==='completed'?'':'amber'}">${d.status==='completed'?'รับไฟล์สำเร็จ':'รอส่งไฟล์'}</span></td><td>${d.status==='completed'?`<a class="small-link" href="https://drive.google.com/file/d/${encodeURIComponent(d.drive_file_id)}/view" target="_blank" rel="noreferrer">${icon('external')}Drive</a>`:'—'}</td></tr>`).join('')}</tbody></table>${!docs.length?'<div class="empty-state">ยังไม่มีเอกสารในรายการนี้<br><small>เอกสารจะแสดงหลังลูกค้าส่งผ่านลิงก์ส่วนตัว</small></div>':''}</div></section>`;
}
function customersView(){
 return heading('CLIENT MANAGEMENT','กล่องรับเอกสารของลูกค้า','สร้างลิงก์ส่วนตัว แล้วส่งให้ลูกค้าเริ่มอัปโหลดได้ทันที',`<button class="btn primary" id="new-customer">${icon('plus')}เพิ่มลูกค้า</button>`)+demoNotice()+`<div class="client-grid">${state.customers.map(c=>`<section class="card client-card"><div class="company"><div class="company-icon">${icon('building')}</div><div><h3>${e(c.name)}</h3><small style="color:var(--muted)">${e(c.code)}</small></div></div><p>${live?'โฟลเดอร์แยกสำหรับลูกค้ารายนี้':'กล่องรับเอกสารตัวอย่าง · ยังไม่สร้างใน Drive'}</p><div class="actions"><span class="tag ${live?'':'gray'}">${live?'พร้อมสร้างลิงก์':'ตัวอย่าง'}</span><div class="row"><button class="btn" data-create-link="${e(c.id)}">${icon('link')}สร้างลิงก์</button>${live?`<button class="icon-button" data-revoke="${e(c.id)}" aria-label="ปิดลิงก์ทั้งหมดของ ${e(c.name)}">${icon('lock')}</button>`:''}</div></div></section>`).join('')}</div>${!state.customers.length?'<div class="card empty-state">เริ่มจากเพิ่มลูกค้ารายแรก ระบบจะสร้างโฟลเดอร์ย่อยใน Google Drive ให้</div>':''}`;
}
function driveConnectionPanel(){
 if(!live)return '';
 const status=state.driveStatus;
 return `<div class="notice" style="margin-top:18px">${icon('info')}<span>${e(status?.message||'กดตรวจการเชื่อมต่อเพื่อดูสถานะล่าสุด')}</span></div><div class="row" style="flex-wrap:wrap"><button class="btn" id="check-drive">${icon('clock')}ตรวจการเชื่อมต่ออีกครั้ง</button>${status?.code==='folder_unavailable'&&status.authorize_url?`<a class="btn primary" href="${e(status.authorize_url)}" target="_blank" rel="noreferrer">${icon('folder')}เลือกโฟลเดอร์ผ่าน Google</a>`:''}</div>${status?.code==='folder_unavailable'?`<p>เปิด <a href="https://console.cloud.google.com/apis/library/picker.googleapis.com?project=optimum-rock-503308-j1" target="_blank" rel="noreferrer">Google Picker API</a> แล้วกด Enable ก่อนเลือกโฟลเดอร์ เมื่อเลือกเสร็จให้กลับมากดตรวจการเชื่อมต่ออีกครั้ง</p>`:''}${status?.code==='drive_api_disabled'?`<p><a href="https://console.cloud.google.com/apis/library/drive.googleapis.com?project=optimum-rock-503308-j1" target="_blank" rel="noreferrer">เปิดใช้งาน Google Drive API ↗</a></p>`:''}`;
}
function settingsView(){
 return heading('CONNECTIONS','พื้นที่เก็บเอกสารของคุณ','Google Drive เก็บไฟล์ต้นฉบับ · Supabase เก็บข้อมูลและสถานะ')+`<div class="settings-grid"><section class="card settings-card"><div class="row" style="justify-content:space-between"><h2 class="row">${icon('drive')} Google Drive</h2><span class="tag ${state.driveReady?'':'amber'}">${state.driveReady?'เชื่อมต่อแล้ว':'รออนุญาต Google OAuth'}</span></div><p>โฟลเดอร์หลัก <b>sendfile</b> สำหรับแยกโฟลเดอร์ลูกค้า ระบบจะไม่เปิดเผยไฟล์เดิมให้ผู้ที่มีลิงก์ส่งเอกสาร</p><div class="field"><label>โฟลเดอร์ที่เลือก</label><code>${e(cfg.driveFolderId)}</code></div><p><a href="https://drive.google.com/drive/folders/${encodeURIComponent(cfg.driveFolderId)}" target="_blank" rel="noreferrer">เปิดโฟลเดอร์ sendfile ↗</a></p><p>การเชื่อมต่อ Drive ในแชตใช้กับแอปนี้โดยอัตโนมัติไม่ได้ ต้องตั้งค่าการอนุญาตของแอปแยกอีกครั้งก่อนรับไฟล์จริง</p>${driveConnectionPanel()}</section><section class="card settings-card"><div class="row" style="justify-content:space-between"><h2 class="row">${icon('settings')} Supabase</h2><span class="tag ${configuredBackend?'':'amber'}">${configuredBackend?'เตรียมฐานข้อมูลแล้ว':'รอตั้งค่า'}</span></div><p>ใช้โปรเจกต์ <b>testwebsite</b> ร่วมกับแอปเดิม โดยสร้างตารางชื่อขึ้นต้นด้วย <code>sendfile_</code> และแยกสิทธิ์ผู้ดูแลของแอปนี้</p><p>บัญชีผู้ดูแลใช้ Supabase Auth ส่วนลูกค้าใช้ลิงก์ส่งไฟล์ที่หมดอายุใน 30 วันและปิดใช้งานได้</p><a class="btn" href="?mode=live">เปิดพื้นที่ผู้ดูแลจริง ↗</a></section><section class="card settings-card"><h2>ขอบเขตรุ่นแรก</h2><ul><li>รับไฟล์ทุกนามสกุลที่ขนาดไม่เกิน 20 MB ต่อไฟล์ เก็บเป็นต้นฉบับ</li><li>ลิงก์รับไฟล์อย่างเดียว ไม่แสดงประวัติหรือไฟล์เดิมให้ลูกค้า</li><li>จำกัด 200 รายการและ 200 MB ต่อลิงก์ เพื่อควบคุมปริมาณอัปโหลด</li><li>ยังไม่อ่านข้อมูลบัญชี แปลง HEIC หรือเชื่อม Express / FlowAccount / PEAK</li></ul></section></div>`;
}
async function refreshAdmin(){
 if(!live)return render();
 try{const data=await api('admin-data');state.customers=data.customers;state.documents=data.documents;state.driveReady=data.drive_ready;state.driveStatus=data.drive_status;render();}
 catch(err){showApiError(err);}
}
function showDialog(content){$('#modal').innerHTML=content;$('#modal').showModal();$('#modal').querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#modal').close());}
function newCustomer(){
 showDialog(`<form id="customer-form"><h2>เพิ่มกล่องรับเอกสาร</h2><div class="field"><label for="customer-name">ชื่อลูกค้า / บริษัท</label><input id="customer-name" maxlength="120" required></div><div class="field"><label for="customer-code">รหัสลูกค้า</label><input id="customer-code" maxlength="30" placeholder="เช่น SF-004" required pattern="[A-Za-z0-9_-]+"></div><p class="subtitle">${live?'ระบบจะสร้างโฟลเดอร์ย่อยใน sendfile':'โหมดทดลอง: สร้างเฉพาะข้อมูลบนหน้าจอนี้'}</p><div class="actions"><button type="button" class="btn" data-close>ยกเลิก</button><button class="btn primary" type="submit">เพิ่มลูกค้า</button></div><p id="customer-error" role="alert"></p></form>`);
 $('#modal [data-close]').onclick=()=>$('#modal').close();
 $('#customer-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;
  try{const name=$('#customer-name').value.trim(),code=$('#customer-code').value.trim();if(!name)throw new Error('กรุณากรอกชื่อลูกค้า');
   if(live)await api('customer-create',{name,code});else state.customers.push({id:crypto.randomUUID(),name,code});
   $('#modal').close();await refreshAdmin();toast(live?'เพิ่มลูกค้าและโฟลเดอร์แล้ว':'เพิ่มลูกค้าตัวอย่างแล้ว');
  }catch(err){if(live&&!state.session)showApiError(err);else $('#customer-error').textContent=err.message;}finally{button.disabled=false;}
 };
}
async function createLink(id,button){
 if(!live){toast('ลิงก์จริงจะสร้างได้หลังเชื่อม Supabase และ Google Drive');return;}
 button.disabled=true;
 try{const result=await api('link-create',{customer_id:id});const url=new URL(location.href);url.search='';url.hash=new URLSearchParams({send:result.token}).toString();
  showDialog(`<h2>ลิงก์ส่งเอกสารพร้อมแล้ว</h2><p class="subtitle">ผู้ที่มีลิงก์นี้ส่งไฟล์ได้อย่างเดียว ลิงก์หมดอายุใน 30 วัน เก็บลิงก์ไว้และส่งให้ลูกค้าด้วยตัวคุณเอง</p><p class="link-output" id="created-link"></p><div class="actions"><button class="btn" data-close>ปิด</button><button class="btn primary" id="copy-link">${icon('link')}คัดลอกลิงก์</button></div>`);$('#created-link').textContent=url.href;
  $('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(url.href);toast('คัดลอกลิงก์แล้ว');}catch{toast('กรุณาเลือกและคัดลอกลิงก์ที่แสดง');}};
 }catch(err){showApiError(err);}finally{button.disabled=false;}
}
function bind(){
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=async()=>{if(state.sending){toast('กรุณารอให้ส่งไฟล์เสร็จก่อนเปลี่ยนหน้า');return;}state.view=b.dataset.view;render();if(live&&state.session&&state.view!=='upload')await refreshAdmin();});
 if($('#logout'))$('#logout').onclick=async()=>{try{await fetch(`${cfg.supabaseUrl}/auth/v1/logout`,{method:'POST',headers:{apikey:cfg.publishableKey,Authorization:`Bearer ${state.session.access_token}`}});}catch{}state.session=null;state.customers=[];state.documents=[];sessionStorage.removeItem('sendfile-admin');render();};
 if($('#choose-files')){
  $('#choose-files').onclick=()=>$('#file-input').click();$('#take-photo').onclick=()=>$('#camera-input').click();
  for(const id of ['file-input','camera-input'])$('#'+id).onchange=ev=>{addFiles(ev.target.files);ev.target.value='';};
  const drop=$('#dropzone');drop.ondragover=ev=>{ev.preventDefault();if(!state.sending)drop.classList.add('drag');};drop.ondragleave=()=>drop.classList.remove('drag');drop.ondrop=ev=>{ev.preventDefault();drop.classList.remove('drag');addFiles(ev.dataTransfer.files);};
  $('#period').onchange=ev=>state.period=ev.target.value;$('#category').onchange=ev=>state.category=ev.target.value;$('#note').oninput=ev=>state.note=ev.target.value;$('#send-files').onclick=sendFiles;
 }
 if($('#login-form'))$('#login-form').onsubmit=async ev=>{ev.preventDefault();ev.submitter.disabled=true;$('#login-error').textContent='';
  try{const res=await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.publishableKey},body:JSON.stringify({email:$('#email').value,password:$('#password').value})});
   const data=await res.json();if(!res.ok)throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');state.session=sessionFromResponse(data);
   await api('admin-data');sessionStorage.setItem('sendfile-admin',JSON.stringify(state.session));await refreshAdmin();
  }catch(err){state.session=null;$('#login-error').textContent=err.message;}finally{if($('#login-form'))$('#login-form button').disabled=false;}
 };
 if($('#new-customer'))$('#new-customer').onclick=newCustomer;
 document.querySelectorAll('[data-create-link]').forEach(b=>b.onclick=()=>createLink(b.dataset.createLink,b));
 document.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=()=>{
  showDialog(`<h2>ปิดลิงก์ทั้งหมดของลูกค้ารายนี้?</h2><p class="subtitle">ลิงก์เดิมจะรับไฟล์ไม่ได้อีก ไฟล์ที่ส่งสำเร็จแล้วจะยังอยู่ใน Drive คุณสร้างลิงก์ใหม่ได้ภายหลัง</p><div class="actions"><button class="btn" data-close>ยกเลิก</button><button class="btn danger" id="confirm-revoke">ปิดลิงก์ทั้งหมด</button></div>`);
  $('#confirm-revoke').onclick=async ev=>{ev.currentTarget.disabled=true;try{await api('link-revoke',{customer_id:b.dataset.revoke});$('#modal').close();toast('ปิดลิงก์ทั้งหมดแล้ว');}catch(err){toast(err.message);ev.target.disabled=false;}};
 });
 if($('#search'))$('#search').oninput=ev=>{state.search=ev.target.value;const caret=ev.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(caret,caret);};
 if($('#status-filter'))$('#status-filter').onchange=ev=>{state.filter=ev.target.value;render();};
 if($('#refresh'))$('#refresh').onclick=refreshAdmin;
 if($('#check-drive'))$('#check-drive').onclick=async ev=>{ev.currentTarget.disabled=true;try{const status=await api('drive-status');state.driveStatus=status;state.driveReady=status.ready;render();}catch(err){showApiError(err);if($('#check-drive'))$('#check-drive').disabled=false;}};
}
window.addEventListener('beforeunload',ev=>{if(state.sending){ev.preventDefault();ev.returnValue='';}});
render();
if(live&&portalToken){state.loading=true;render();api('portal-info',{token:portalToken}).then(data=>{state.customer=data.customer;state.driveReady=true;}).catch(err=>state.portalError=err.message).finally(()=>{state.loading=false;render();});}
else if(portalToken&&!live){state.portalError='ระบบรับเอกสารจริงยังไม่ได้ตั้งค่า ลิงก์นี้ยังใช้งานไม่ได้';render();}
