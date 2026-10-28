import {test} from 'node:test';
import assert from 'node:assert/strict';
import {refreshSession,sessionFromResponse} from '../dist/auth.js';
test('session retains rotated refresh token and computes expiry',()=>{
 const session=sessionFromResponse({access_token:'access',refresh_token:'refresh',expires_in:3600});
 assert.equal(session.refresh_token,'refresh');assert.ok(session.expires_at>Date.now()/1000+3500);
 assert.throws(()=>sessionFromResponse({access_token:'access'}));
});
test('refresh uses Supabase refresh grant and accepts the rotated token',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{assert.equal(url,'https://example.supabase.co/auth/v1/token?grant_type=refresh_token');assert.deepEqual(JSON.parse(init.body),{refresh_token:'old'});return Response.json({access_token:'new-access',refresh_token:'rotated',expires_in:3600});};
 try{assert.equal((await refreshSession({supabaseUrl:'https://example.supabase.co',publishableKey:'public'},{refresh_token:'old'})).refresh_token,'rotated');}finally{globalThis.fetch=original;}
});
test('expired legacy session requests login without sending an incomplete refresh',async()=>{
 await assert.rejects(refreshSession({supabaseUrl:'https://example.supabase.co'},{access_token:'legacy'}),/เข้าสู่ระบบ/);
});
