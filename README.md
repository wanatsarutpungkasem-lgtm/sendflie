# Sendfile

แอปรับไฟล์ลูกค้าเข้า Google Drive แยกโฟลเดอร์ โดยใช้ Supabase เก็บ metadata และสิทธิ์ผู้ดูแล

## สถานะส่งมอบ

- หน้ารับเอกสาร / ลูกค้า / เอกสาร / การเชื่อมต่อ พร้อมให้ทดลอง
- เพิ่มตาราง Sendfile ใน Supabase `testwebsite` แล้ว โดยไม่เปลี่ยนตาราง `file_uploads` เดิม
- Edge Function `sendfile-portal` deploy แล้ว ตั้งค่า OAuth และบัญชีผู้ดูแลแล้ว ทดสอบอัปโหลดผ่านเว็บออนไลน์เข้า Drive จริงครบ JPG/PNG/HEIC/PDF เมื่อ 28 ต.ค. 2026
- โฟลเดอร์หลักที่ผู้ใช้เลือก: https://drive.google.com/drive/folders/13g59K6moZp6Go7NnkaWoSsq5ORgbAo_p
- หน้าหลักตั้ง `demoMode: false` และเปิดหน้าผู้ดูแลโดยตรง ลูกค้าส่งไฟล์ผ่านลิงก์ส่วนตัวที่สร้างจากหน้าลูกค้า
- ยืนยันไฟล์ทดสอบทั้ง 4 ในโฟลเดอร์หลัก sendfile พร้อมขนาดและสถานะ completed ใน Supabase; ชุดทดสอบนี้ใช้ลูกค้า QA ที่ชี้โฟลเดอร์หลัก ยังไม่ครอบคลุมขั้นตอนสร้างโฟลเดอร์ลูกค้าใหม่
- GitHub ที่ผู้ใช้เลือก: https://github.com/wanatsarutpungkasem-lgtm/sendflie ส่วน repository ของ Sites ใช้สำหรับเผยแพร่ตัวอย่าง

## รันและตรวจสอบ

ใช้ Node 22.13+ และ Python 3 ไม่ต้องติดตั้ง dependency

```sh
npm run dev
npm run check
npm test
```

เปิด http://localhost:5184 หน้าจอทดลองรองรับเลือกไฟล์ ลากวาง ถ่ายรูปผ่าน file picker มือถือ ตรวจขนาด และทดลองส่ง บน desktop ปุ่มถ่ายรูปอาจเปิดตัวเลือกไฟล์แทนกล้องตามเบราว์เซอร์

## เปิดใช้งานจริง

1. ตั้ง Google Cloud OAuth สำหรับบัญชีเจ้าของโฟลเดอร์ เปิด Drive API และรับ refresh token แบบ offline ตาม [คู่มือ Google](https://developers.google.com/identity/protocols/oauth2/web-server) ใช้ flow ที่มี state ตรวจสอบและ redirect URI ตรงกัน Google แนะนำใช้ client library ของผู้ให้บริการ
2. แนะนำใช้ scope `https://www.googleapis.com/auth/drive.file` โดยสร้างโฟลเดอร์ผ่านแอป หรือเลือกโฟลเดอร์ที่มีอยู่ผ่าน Google Picker ด้วย OAuth client เดียวกัน เพื่อให้แอปเข้าถึงโฟลเดอร์นั้นได้ การมี URL โฟลเดอร์อย่างเดียวไม่ให้สิทธิ์ API หลีกเลี่ยงการขอสิทธิ์ทั้ง Drive หากไม่จำเป็น
3. บันทึก `SENDFILE_GOOGLE_CLIENT_ID`, `SENDFILE_GOOGLE_CLIENT_SECRET`, `SENDFILE_GOOGLE_REFRESH_TOKEN` ใน [Supabase Secrets](https://supabase.com/dashboard/project/wabbwmoeuxszibgzolzx/functions/secrets) เท่านั้น ห้ามส่งในแชตหรือใส่ GitHub / frontend
4. หาก Google OAuth consent screen ยังเป็น External/Testing, refresh token ของ scope Drive มักหมดอายุใน 7 วัน ต้องเตรียม production publishing / verification ตามนโยบาย Google ก่อนใช้ระยะยาว
5. สร้างหรือเลือกบัญชีเจ้าของแอปใน Supabase Auth แล้วเพิ่ม UUID ที่ตรวจยืนยันแล้วลง `public.sendfile_admins(user_id)` ผ่าน SQL Editor อย่าให้สิทธิ์ผู้ใช้ Auth เดิมทั้งหมดโดยอัตโนมัติ ไม่เปลี่ยน provider / redirect / อีเมลของโปรเจกต์ที่ใช้ร่วมกัน
6. ตั้ง allowed origins ให้ตรงโดเมนจริง รวม localhost เฉพาะช่วงพัฒนา ค่า default มีเฉพาะ private preview และ localhost แล้ว
7. เปิด `?mode=live` เลือกเมนูลูกค้า ล็อกอินผู้ดูแล และตรวจว่า Drive พร้อมรับไฟล์ จากนั้นเพิ่มลูกค้าและสร้างลิงก์ ลิงก์จะแสดงครั้งเดียว ต้องคัดลอกไว้เอง
8. เปิดลิงก์ลูกค้าในอีก browser ส่งไฟล์ทดสอบ HEIC/JPG/PNG/PDF ตรวจทั้ง bytes ต้นฉบับใน Drive และสถานะ completed ในฐานข้อมูล แล้วทดสอบปิดลิงก์ / หมดอายุ / ข้ามลูกค้า
9. ตรวจโฮสต์ให้ลูกค้าเข้าถึงได้ก่อนส่งลิงก์ให้บุคคลภายนอก Preview ของ Sites เป็น owner-private ตามค่าเริ่มต้น ส่วน GitHub Pages ต้องเพิ่ม origin ของเว็บใน `SENDFILE_ALLOWED_ORIGINS` ด้วย

บัญชีผู้ดูแลเก็บ access token, refresh token และเวลาหมดอายุใน sessionStorage ของแท็บ ต่ออายุผ่าน Supabase Auth เมื่อใกล้หมดอายุหรือเมื่อได้รับ 401 และลองคำขอซ้ำได้ครั้งเดียว เซสชันจากรุ่นเดิมที่ไม่มี refresh token ต้องเข้าสู่ระบบใหม่หนึ่งครั้ง

การอนุญาต Drive ใน Codex connector ไม่ได้ออก credentials ให้แอปนี้ แอปต้องมี OAuth ของตนเอง ส่วนนี้ยังไม่ได้ทำอัตโนมัติใน UI และต้องตั้งค่าก่อน

### ตรวจปัญหาการเชื่อมต่อและเลือกโฟลเดอร์

หน้า “การเชื่อมต่อ” ในโหมดจริงมีปุ่มตรวจสถานะล่าสุด แยกปัญหารหัสไม่ครบ, OAuth ใช้งานไม่ได้, Drive API ยังไม่เปิด, โฟลเดอร์เข้าถึงไม่ได้ และโฟลเดอร์อ่านได้อย่างเดียว Endpoint นี้ตรวจ Supabase Auth และ Sendfile admin allowlist ก่อนทุกครั้ง ไม่ส่ง access token, refresh token หรือ client secret กลับไปยัง browser

ถ้ารหัส Google ใช้ได้แต่ยังเข้าถึงโฟลเดอร์ไม่ได้ ให้เปิด Google Picker API ใน Google Cloud project เดียวกับ OAuth client แล้วใช้ปุ่ม “เลือกโฟลเดอร์ผ่าน Google” ระบบใช้ OAuth Picker แบบ redirect ซึ่งรองรับ `drive.file` โดยเพิ่ม `trigger_onepick=true` และอนุญาตให้เลือกโฟลเดอร์ จากนั้นให้กลับมาตรวจการเชื่อมต่ออีกครั้ง หากจำเป็นต้องเปลี่ยน refresh token ให้แลก authorization code ใน OAuth Playground โดยใช้ OAuth credentials ของแอปเอง แล้วอัปเดต Supabase Secret เดิม ห้ามส่ง code หรือ token ผ่านแชต

URL ของปุ่มใช้ callback OAuth Playground ที่ลงทะเบียนไว้สำหรับการตั้งค่าครั้งแรก ไม่ใช่ callback รับ token ของ Sendfile เอง แอปไม่อ่าน query หรือรับ code กลับจาก Playground ดู [คู่มือ Google OAuth Picker แบบ redirect](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker)

## โครงสร้าง

- `dist/` static frontend ไม่มี secret, framework หรือ third-party JS dependency
- `supabase/functions/portal/index.ts` backend REST handler, ตรวจ Supabase Auth + Sendfile admin allowlist หรือ upload-only token
- `database/setup.sql` SQL ฉบับเดียวกับที่ใช้ติดตั้ง cloud schema ไม่ใช่ CLI migration timestamp ปลอม หากใช้ Supabase CLI ให้ตรวจ `supabase --help` และ pull migration history ของ cloud ก่อนแก้ต่อ
- `tests/` ตรวจ file validation และ backend auth / CORS / request limits
- `dist/core.js` กับ `supabase/functions/portal/core.js` ต้องเหมือนกัน มี test ตรวจไว้

## ข้อมูลและสิทธิ์

ตาราง `sendfile_admins`, `sendfile_customers`, `sendfile_links`, `sendfile_documents` เปิด RLS และ revoke สิทธิ์ทั้งหมดจาก anon/authenticated ตั้งใจไม่สร้าง browser policies เพราะเข้าถึงผ่าน Edge Function เท่านั้น การแจ้ง INFO `RLS Enabled No Policy` 4 รายการเป็นผลจากโมเดลนี้ ไม่ใช่การเปิดข้อมูลสาธารณะ service_role ใช้เฉพาะ backend

ลูกค้าใช้ random capability 256-bit ผ่าน URL fragment เก็บเฉพาะ SHA-256 hash ในฐานข้อมูล ไม่มี read/list/download ของลูกค้า ลิงก์ใช้ได้ 30 วัน และปิดได้ ผู้ที่ได้ลิงก์ต่อจะส่งไฟล์ได้ จึงควรส่งเฉพาะผู้รับที่ต้องการ ลิงก์ไม่ยืนยันตัวบุคคล

เพิ่มลูกค้าแล้วสร้างโฟลเดอร์ย่อย `${code} — ${name}` ใต้ sendfile เอกสารบันทึกเดือนและหมวดหมู่ใน Supabase ก่อน ในรุ่นนี้ไม่ได้สร้างโฟลเดอร์รายเดือนเพิ่ม

Backend ส่ง Origin ที่ผ่าน allowlist ไปตอนเริ่ม resumable session เพื่อให้ Google ตอบ CORS สำหรับการ PUT จาก browser ได้

อัปโหลดผ่าน Drive resumable session โดย browser ไม่ได้รับ Google access token URL session เป็น capability ชั่วคราวสำหรับไฟล์ที่กำหนด ห้าม log หรือแจกต่อ Backend ตรวจขนาด MIME parent folder และ appProperties จาก Drive ก่อนเปลี่ยนสถานะ completed การ retry หลัง complete response ผิดพลาดจะตรวจไฟล์เดิมแทนอัปโหลดซ้ำ

จำกัด 20 MB/ไฟล์, 40 ไฟล์/ชุด และ 200 MB/200 reservations ต่อลิงก์ ใช้ transaction + row lock ตรวจ quota งานที่ขัดข้องยังคงใช้ quota เพื่อกัน abuse ให้ผู้ดูแลปิดลิงก์เก่าและออกใหม่หากจำเป็น ไม่มี background reconciler หรือการ resume ข้าม session ในรุ่นนี้ อัปโหลดที่ browser หลุดหลัง Drive รับแล้วแต่ก่อนยืนยันอาจค้าง pending ต้องตรวจ Drive ก่อนส่งซ้ำ

ไฟล์ทุกนามสกุลเก็บเป็น binary ต้นฉบับ ไม่รันไฟล์ที่รับ ไม่มี antivirus หรือ OCR/บัญชีอัตโนมัติในรุ่นนี้ และไม่มี preview HEIC ใน browser ที่ไม่รองรับ

## การต่อยอด

OAuth onboarding ในแอป, OTP สำหรับลูกค้าที่ต้องอ่านเอกสารย้อนหลัง, upload reconciliation, antivirus, OCR และ connectors Express / FlowAccount / PEAK
