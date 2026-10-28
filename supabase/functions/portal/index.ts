import { validateFile, normalizeMime } from './core.js';

// Uses standard REST APIs; no third-party runtime dependencies.
const env = (key: string) => (Deno.env.get(key) || '').trim();
const SB = env('SUPABASE_URL');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const ROOT = env('SENDFILE_DRIVE_FOLDER_ID') || '13g59K6moZp6Go7NnkaWoSsq5ORgbAo_p';
const configured = () => Boolean(ROOT && env('SENDFILE_GOOGLE_CLIENT_ID') && env('SENDFILE_GOOGLE_CLIENT_SECRET') && env('SENDFILE_GOOGLE_REFRESH_TOKEN'));
const allowedOrigins = () => (env('SENDFILE_ALLOWED_ORIGINS') || 'https://sendfile-client-inbox.wanatsarut-p.chatgpt.site,http://localhost:5184').split(',').map(x=>x.trim()).filter(Boolean);
const uuid = (x: unknown) => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
class HttpError extends Error { constructor(message: string, public status=400){super(message);} }
async function db(path: string, method='GET',body?: unknown) {
 const r=await fetch(`${SB}/rest/v1/${path}`,{method,headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok){const error=await r.json().catch(()=>({}));if(error.code==='23505')throw new HttpError('รหัสลูกค้านี้ถูกใช้แล้ว');if(error.code==='P0001')throw new HttpError(error.message);throw new HttpError('ฐานข้อมูลไม่พร้อม กรุณาติดต่อผู้ดูแล',503);}
 return r.status===204?null:r.json();
}
async function admin(req: Request){
 const authorization=req.headers.get('Authorization');
 if(!authorization?.startsWith('Bearer '))throw new HttpError('กรุณาเข้าสู่ระบบผู้ดูแล',401);
 const response=await fetch(`${SB}/auth/v1/user`,{headers:{apikey:SERVICE,Authorization:authorization}});
 if(!response.ok)throw new HttpError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',401);
 const user=await response.json();
 if(!uuid(user.id))throw new HttpError('ยืนยันตัวตนไม่สำเร็จ',401);
 const rows=await db(`sendfile_admins?user_id=eq.${user.id}&select=user_id`);
 if(!rows.length)throw new HttpError('บัญชีนี้ยังไม่ได้รับสิทธิ์ผู้ดูแล Sendfile',403);
 return user.id;
}
async function hash(token: string){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
}
async function link(token: unknown){
 if(typeof token!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(token))throw new HttpError('ลิงก์ไม่ถูกต้อง',403);
 const digest=await hash(token);
 const rows=await db(`sendfile_links?token_hash=eq.${digest}&select=id,customer_id,expires_at,revoked_at`);
 const l=rows[0];if(!l||l.revoked_at||new Date(l.expires_at).getTime()<=Date.now())throw new HttpError('ลิงก์หมดอายุหรือถูกปิดแล้ว',403);
 return {...l,hash:digest};
}
async function googleToken(){
 if(!configured())throw new HttpError('ผู้ดูแลยังไม่ได้เชื่อมต่อ Google Drive',503);
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env('SENDFILE_GOOGLE_CLIENT_ID'),client_secret:env('SENDFILE_GOOGLE_CLIENT_SECRET'),refresh_token:env('SENDFILE_GOOGLE_REFRESH_TOKEN'),grant_type:'refresh_token'})});
 if(!response.ok)throw new HttpError('สิทธิ์ Google Drive ใช้งานไม่ได้ กรุณาแจ้งผู้ดูแลเชื่อมต่อใหม่',503);
 return (await response.json()).access_token;
}
async function drive(path: string, token: string, init: RequestInit={}){
 const response=await fetch(`https://www.googleapis.com/drive/v3/${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...init.headers}});
 if(!response.ok)throw new HttpError('Google Drive ไม่พร้อม หรือไม่มีสิทธิ์เข้าถึงโฟลเดอร์',503);
 return response.json();
}
async function driveStatus(){
 if(!configured())return {ready:false,code:'missing_credentials',message:'ยังพบรหัสเชื่อมต่อไม่ครบ กรุณาตรวจ Secrets ทั้ง 3 รายการใน Supabase'};
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env('SENDFILE_GOOGLE_CLIENT_ID'),client_secret:env('SENDFILE_GOOGLE_CLIENT_SECRET'),refresh_token:env('SENDFILE_GOOGLE_REFRESH_TOKEN'),grant_type:'refresh_token'})});
 const result=await response.json();
 if(!response.ok||!result.access_token){
  const messages:Record<string,string>={invalid_client:'Google แจ้ง invalid_client: Client ID หรือ Client secret ไม่ถูกต้อง หรือไม่ได้เป็นคู่จาก OAuth client เดียวกัน',invalid_grant:'Google แจ้ง invalid_grant: Refresh token ใช้ไม่ได้ อาจถูกยกเลิก หมดอายุ หรือออกให้ OAuth client คนละตัว กรุณาออก Refresh token ใหม่ด้วย Client ID/Secret คู่นี้',unauthorized_client:'Google แจ้ง unauthorized_client: OAuth client นี้ยังไม่ได้รับอนุญาตให้ใช้วิธีเชื่อมต่อนี้',invalid_request:'Google แจ้ง invalid_request: ข้อมูลรหัสเชื่อมต่อมีรูปแบบไม่ถูกต้อง กรุณาตรวจค่าที่บันทึกใน Secrets'};
  const known=typeof result.error==='string'&&Object.hasOwn(messages,result.error);
  return {ready:false,code:'oauth_failed',oauth_error:known?result.error:'unknown',message:known?messages[result.error]:'ตรวจรหัสเชื่อมต่อกับ Google ไม่สำเร็จ กรุณาลองอีกครั้งหรือตรวจ Secrets ของแอป'};
 }
 const folder=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ROOT)}?fields=id,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${result.access_token}`}});
 const data=await folder.json();
 if(!folder.ok){
  const reasons=(data.error?.errors||[]).map((x:any)=>x.reason);
  if(reasons.some((x:string)=>['accessNotConfigured','serviceDisabled'].includes(x))||data.error?.details?.some((x:any)=>x.reason==='SERVICE_DISABLED'))return {ready:false,code:'drive_api_disabled',message:'รหัสเชื่อมต่อใช้ได้ แต่ต้องเปิด Google Drive API ใน Google Cloud ก่อน'};
  const authorize=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.search=new URLSearchParams({client_id:env('SENDFILE_GOOGLE_CLIENT_ID'),redirect_uri:'https://developers.google.com/oauthplayground',scope:'https://www.googleapis.com/auth/drive.file',response_type:'code',access_type:'offline',prompt:'consent',include_granted_scopes:'false',trigger_onepick:'true',allow_folder_selection:'true',file_ids:ROOT,mimetypes:'application/vnd.google-apps.folder'}).toString();
  return {ready:false,code:'folder_unavailable',message:'รหัสเชื่อมต่อ Google ใช้ได้แล้ว แต่แอปยังเข้าถึงโฟลเดอร์ sendfile ไม่ได้ ต้องเลือกโฟลเดอร์ให้แอปผ่าน Google Picker',authorize_url:authorize.href};
 }
 if(data.mimeType!=='application/vnd.google-apps.folder'||data.trashed)return {ready:false,code:'invalid_folder',message:'ปลายทางไม่ใช่โฟลเดอร์ที่ใช้งานได้ กรุณาตรวจโฟลเดอร์ใน Drive'};
 if(data.capabilities?.canAddChildren!==true)return {ready:false,code:'folder_read_only',message:'บัญชี Google นี้ไม่มีสิทธิ์เพิ่มไฟล์ในโฟลเดอร์ sendfile'};
 return {ready:true,code:'ready',message:'เชื่อมต่อ Google และมีสิทธิ์เพิ่มไฟล์ในโฟลเดอร์ sendfile แล้ว'};
}
async function route(req: Request, b: any){
 if(!b||typeof b!=='object'||Array.isArray(b))throw new HttpError('คำขอไม่ถูกต้อง');
 if(b.op==='portal-info'){
  const l=await link(b.token);if(!configured())throw new HttpError('ระบบรับเอกสารยังไม่พร้อม กรุณาติดต่อผู้ดูแล',503);
  const [customer]=await db(`sendfile_customers?id=eq.${l.customer_id}&select=name,code`);
  return {customer};
 }
 if(b.op==='upload-init'){
  const l=await link(b.token);const invalid=validateFile({name:b.name,size:b.size});if(invalid)throw new HttpError(invalid);
  if(typeof b.period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.period))throw new HttpError('กรุณาระบุเดือนให้ถูกต้อง');
  const categories=['เอกสารทั่วไป','รายจ่าย / บิลซื้อ','รายรับ / บิลขาย','รายการเดินบัญชี','เอกสารอื่น ๆ'];
  if(!categories.includes(b.category)||typeof b.note!=='string'||b.note.length>1000)throw new HttpError('ข้อมูลประกอบไฟล์ไม่ถูกต้อง');
  const [c]=await db(`sendfile_customers?id=eq.${l.customer_id}&select=drive_folder_id`);
  const token=await googleToken();
  const generated=await drive('files/generateIds?count=1&space=drive&type=files',token);
  const fileId=generated.ids[0]; const mime=normalizeMime(b.name,b.mime);
  const id=await db('rpc/sendfile_reserve_upload','POST',{p_hash:l.hash,p_name:b.name,p_size:b.size,p_mime:mime,p_period:b.period,p_category:b.category,p_note:b.note,p_drive_id:fileId});
  const uploadHeaders:Record<string,string>={Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Upload-Content-Type':mime,'X-Upload-Content-Length':String(b.size)};
  // Google binds resumable-session CORS to the browser origin at initiation.
  const browserOrigin=req.headers.get('Origin');if(browserOrigin)uploadHeaders.Origin=browserOrigin;
  const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',{method:'POST',headers:uploadHeaders,body:JSON.stringify({id:fileId,name:b.name,parents:[c.drive_folder_id],appProperties:{sendfile_document_id:id}})});
  const uploadUrl=response.headers.get('Location');
  if(!response.ok||!uploadUrl)throw new HttpError('เริ่มอัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง',503);
  return {document_id:id,upload_url:uploadUrl};
 }
 if(b.op==='upload-complete'){
  const l=await link(b.token);if(!uuid(b.document_id))throw new HttpError('รายการไม่ถูกต้อง');
  const [doc]=await db(`sendfile_documents?id=eq.${b.document_id}&link_id=eq.${l.id}&select=*`);
  if(!doc)throw new HttpError('ไม่พบรายการ',404);
  const token=await googleToken();
  const actual=await drive(`files/${encodeURIComponent(doc.drive_file_id)}?fields=id,size,mimeType,parents,trashed,appProperties&supportsAllDrives=true`,token);
  const [customer]=await db(`sendfile_customers?id=eq.${doc.customer_id}&select=drive_folder_id`);
  if(actual.trashed||Number(actual.size)!==Number(doc.size_bytes)||actual.mimeType!==doc.mime_type||!actual.parents?.includes(customer.drive_folder_id)||actual.appProperties?.sendfile_document_id!==doc.id)throw new HttpError('ไฟล์ใน Drive ยังไม่ครบหรือข้อมูลไม่ตรง กรุณาลองอีกครั้ง',409);
  if(doc.status!=='completed')await db(`sendfile_documents?id=eq.${doc.id}&status=eq.pending`,'PATCH',{status:'completed',completed_at:new Date().toISOString()});
  return {completed:true};
 }
 await admin(req);
 if(b.op==='drive-status')return await driveStatus();
 if(b.op==='admin-data'){
  const [customers,documents]=await Promise.all([db('sendfile_customers?select=*&order=created_at.desc'),db('sendfile_documents?select=*&order=created_at.desc&limit=1000')]);
  let status:any={ready:false,code:'unreachable',message:'ตรวจ Google Drive ไม่สำเร็จ กรุณาตรวจอีกครั้ง'};
  try{status=await driveStatus();}catch{/* No provider credentials or responses are logged or returned. */}
  return {customers,documents:documents.map((d:any)=>({...d,customer_name:customers.find((c:any)=>c.id===d.customer_id)?.name||''})),drive_ready:status.ready,drive_status:status};
 }
 if(b.op==='customer-create'){
  if(typeof b.name!=='string'||b.name.trim().length<1||b.name.trim().length>120||typeof b.code!=='string'||!/^[A-Za-z0-9_-]{1,30}$/.test(b.code))throw new HttpError('ชื่อลูกค้าหรือรหัสไม่ถูกต้อง');
  const existing=await db(`sendfile_customers?code=eq.${encodeURIComponent(b.code)}&select=id`);if(existing.length)throw new HttpError('รหัสลูกค้านี้ถูกใช้แล้ว');
  const token=await googleToken();const folder=await drive('files?supportsAllDrives=true&fields=id',token,{method:'POST',body:JSON.stringify({name:`${b.code} — ${b.name.trim()}`,mimeType:'application/vnd.google-apps.folder',parents:[ROOT]})});
  try{const [customer]=await db('sendfile_customers','POST',{name:b.name.trim(),code:b.code,drive_folder_id:folder.id});return {customer};}
  catch(error){await drive(`files/${encodeURIComponent(folder.id)}?supportsAllDrives=true`,token,{method:'PATCH',body:JSON.stringify({trashed:true})}).catch(()=>{});throw error;}
 }
 if(b.op==='link-create'){
  if(!uuid(b.customer_id))throw new HttpError('ลูกค้าไม่ถูกต้อง');
  const customers=await db(`sendfile_customers?id=eq.${b.customer_id}&select=id`);if(!customers.length)throw new HttpError('ไม่พบลูกค้า',404);
  const token=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  await db('sendfile_links','POST',{customer_id:b.customer_id,token_hash:await hash(token),expires_at:new Date(Date.now()+30*86400000).toISOString()});
  return {token};
 }
 if(b.op==='link-revoke'){
  if(!uuid(b.customer_id))throw new HttpError('ลูกค้าไม่ถูกต้อง');
  await db(`sendfile_links?customer_id=eq.${b.customer_id}&revoked_at=is.null`,'PATCH',{revoked_at:new Date().toISOString()});return {revoked:true};
 }
 throw new HttpError('ไม่พบคำสั่ง',404);
}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';const allowed=allowedOrigins();const ok=origin&&allowed.includes(origin);
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',Vary:'Origin'};
 if(ok)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,authorization,apikey','Access-Control-Allow-Methods':'POST, OPTIONS'});
 if(req.method==='OPTIONS')return new Response(null,{status:ok?204:403,headers});
 if(origin&&!ok)return new Response(JSON.stringify({error:'เว็บไซต์นี้ยังไม่ได้รับอนุญาต'}),{status:403,headers});
 if(req.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers});
 try{
  // Read request streams with a hard bound, including requests without Content-Length.
  const reader=req.body?.getReader();if(!reader)throw new HttpError('ไม่มีข้อมูล');
  const chunks:Uint8Array[]=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>12000){await reader.cancel();throw new HttpError('คำขอใหญ่เกินไป',413);}chunks.push(value);}
  const buffer=new Uint8Array(total);let offset=0;for(const part of chunks){buffer.set(part,offset);offset+=part.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(buffer));}catch{throw new HttpError('รูปแบบข้อมูลไม่ถูกต้อง');}
  return new Response(JSON.stringify(await route(req,body)),{headers});
 }catch(error){const known=error instanceof HttpError;return new Response(JSON.stringify({error:known?error.message:'ระบบขัดข้อง กรุณาลองอีกครั้ง'}),{status:known?error.status:500,headers});}
});
