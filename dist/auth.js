export function sessionFromResponse(data) {
 if(typeof data?.access_token!=='string'||!data.access_token||typeof data?.refresh_token!=='string'||!data.refresh_token)throw new Error('ข้อมูลเซสชันไม่ครบ กรุณาเข้าสู่ระบบอีกครั้ง');
 return {access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Number(data.expires_at)||Math.floor(Date.now()/1000)+(Number(data.expires_in)||3600)};
}
export async function refreshSession(cfg,session) {
 if(!session?.refresh_token)throw new Error('เซสชันเดิมหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
 const res=await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.publishableKey},body:JSON.stringify({refresh_token:session.refresh_token})});
 if(!res.ok)throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
 return sessionFromResponse(await res.json());
}
