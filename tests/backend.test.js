import {test} from 'node:test';
import assert from 'node:assert/strict';
let handler;
globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret',SENDFILE_ALLOWED_ORIGINS:'https://portal.example'}[key])},serve:fn=>{handler=fn;}};
await import('../supabase/functions/portal/index.ts');
const request=(body,headers={})=>new Request('https://example.supabase.co/functions/v1/sendfile-portal',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('anonymous callers cannot access any admin operation',async()=>{
 for(const op of ['admin-data','customer-create','link-create','link-revoke']){
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
