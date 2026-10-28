import {test} from 'node:test';
import assert from 'node:assert/strict';
let handler;
const envValues={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret',SENDFILE_ALLOWED_ORIGINS:'https://portal.example'};
globalThis.Deno={env:{get:key=>envValues[key]},serve:fn=>{handler=fn;}};
await import('../supabase/functions/portal/index.ts');
const request=(body,headers={})=>new Request('https://example.supabase.co/functions/v1/sendfile-portal',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('anonymous callers cannot access any admin operation',async()=>{
 for(const op of ['admin-data','customer-create','link-create','link-revoke','drive-status']){
  const r=await handler(request({op}));assert.equal(r.status,401);
  assert.ok(!(await r.text()).includes('server-secret'));
 }
});
test('invalid upload capabilities are rejected before Drive access',async()=>{
 for(const token of [null,'guess','<script>','a'.repeat(42)]){
  const r=await handler(request({op:'portal-info',token}));assert.equal(r.status,403);
 }
});
test('foreign browser origins are denied',async()=>{
 const r=await handler(request({op:'portal-info'},{Origin:'https://evil.example'}));assert.equal(r.status,403);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
});
test('allowed CORS preflight succeeds',async()=>{
 const r=await handler(new Request('https://example.supabase.co',{method:'OPTIONS',headers:{Origin:'https://portal.example'}}));
 assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://portal.example');
});
test('local admin login origin passes preflight but still requires authentication',async()=>{
 const configured=envValues.SENDFILE_ALLOWED_ORIGINS;
 delete envValues.SENDFILE_ALLOWED_ORIGINS;
 try{
  for(const origin of ['http://localhost:3000','http://localhost:5184','https://wanatsarutpungkasem-lgtm.github.io']){
   const preflight=await handler(new Request('https://example.supabase.co',{method:'OPTIONS',headers:{Origin:origin}}));
   assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
   assert.equal((await handler(request({op:'admin-data'},{Origin:origin}))).status,401);
  }
  assert.equal((await handler(request({op:'admin-data'},{Origin:'http://localhost:3001'}))).status,403);
 }finally{envValues.SENDFILE_ALLOWED_ORIGINS=configured;}
});
test('unbounded bodies are refused and malformed JSON never becomes an internal error',async()=>{
 assert.equal((await handler(request({op:'x',data:'x'.repeat(13000)}))).status,413);
 assert.equal((await handler(new Request('https://example.supabase.co',{method:'POST',body:'{'}))).status,400);
 assert.equal((await handler(request(null))).status,400);
});
test('a valid Supabase account without Sendfile permissions cannot become admin',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes('/auth/v1/user')?Response.json({id:'11111111-1111-4111-8111-111111111111'}):Response.json([]);
 try{assert.equal((await handler(request({op:'admin-data'},{Authorization:'Bearer valid-user-token'}))).status,403);}finally{globalThis.fetch=original;}
});
test('Drive diagnostics distinguish token, API and folder problems without returning credentials',async()=>{
 const original=globalThis.fetch;
 Object.assign(envValues,{SENDFILE_GOOGLE_CLIENT_ID:'123-test.apps.googleusercontent.com',SENDFILE_GOOGLE_CLIENT_SECRET:'private-client-secret',SENDFILE_GOOGLE_REFRESH_TOKEN:'private-refresh-token'});
 let tokenOkay=true,folderCode=404,reason='notFound';
 globalThis.fetch=async url=>{
  if(String(url).includes('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111'});
  if(String(url).includes('/rest/v1/sendfile_admins'))return Response.json([{user_id:'11111111-1111-4111-8111-111111111111'}]);
  if(String(url).includes('oauth2.googleapis.com/token'))return tokenOkay?Response.json({access_token:'private-access-token'}):Response.json({error:'invalid_grant'},{status:400});
  return folderCode===200?Response.json({mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}}):Response.json({error:{errors:[{reason}]}},{status:folderCode});
 };
 const check=async()=>{
  const response=await handler(request({op:'drive-status'},{Authorization:'Bearer valid-admin-token'}));assert.equal(response.status,200);
  const text=await response.text();for(const secret of ['private-client-secret','private-refresh-token','private-access-token','server-secret'])assert.ok(!text.includes(secret));
  return JSON.parse(text);
 };
 try{
  const unavailable=await check();assert.equal(unavailable.code,'folder_unavailable');
  const url=new URL(unavailable.authorize_url);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');assert.equal(url.searchParams.get('trigger_onepick'),'true');
  folderCode=403;reason='accessNotConfigured';assert.equal((await check()).code,'drive_api_disabled');
  tokenOkay=false;const failed=await check();assert.equal(failed.code,'oauth_failed');assert.equal(failed.oauth_error,'invalid_grant');assert.ok(failed.message.includes('invalid_grant'));
  tokenOkay=true;folderCode=200;assert.equal((await check()).ready,true);
 }finally{globalThis.fetch=original;for(const key of ['SENDFILE_GOOGLE_CLIENT_ID','SENDFILE_GOOGLE_CLIENT_SECRET','SENDFILE_GOOGLE_REFRESH_TOKEN'])delete envValues[key];}
});
