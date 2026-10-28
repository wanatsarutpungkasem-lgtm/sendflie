import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateFile,normalizeMime,escapeHTML,MAX_BYTES} from '../dist/core.js';
test('arbitrary file types are accepted while empty, oversize and invalid sizes are rejected',()=>{
 assert.equal(validateFile({name:'scan.heic',size:MAX_BYTES}),null);
 assert.equal(validateFile({name:'archive.zip',size:800}),null);
 for(const size of [0,-1,NaN,Infinity,1.5,MAX_BYTES+1,'200']) assert.ok(validateFile({name:'file.pdf',size}));
 assert.ok(validateFile({name:'x'.repeat(241),size:1}));
});
test('HEIC and files without browser MIME metadata preserve a valid upload MIME',()=>{
 assert.equal(normalizeMime('IMG_001.HEIC',''),'image/heic');
 assert.equal(normalizeMime('scan.PDF',''),'application/pdf');
 assert.equal(normalizeMime('unknown.xyz',''),'application/octet-stream');
 assert.equal(normalizeMime('unknown.xyz','bad\r\nheader'),'application/octet-stream');
});
test('customer names and file names cannot inject HTML',()=>{
 assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('server and client use identical upload validation',()=>{
 assert.equal(readFileSync(new URL('../dist/core.js',import.meta.url),'utf8'),readFileSync(new URL('../supabase/functions/portal/core.js',import.meta.url),'utf8'));
});
