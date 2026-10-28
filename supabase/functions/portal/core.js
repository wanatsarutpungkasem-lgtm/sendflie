export const MAX_BYTES = 20 * 1024 * 1024;
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function fileType(name = '') {
  return name.includes('.') ? name.split('.').at(-1).slice(0, 8).toUpperCase() : 'FILE';
}
export function sizeLabel(bytes) {
  return bytes === 0 ? '0 KB' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export function validateFile(file) {
  if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 240) return 'ชื่อไฟล์ต้องมีความยาวไม่เกิน 240 ตัวอักษร';
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return 'ไม่สามารถส่งไฟล์ว่างได้';
  if (file.size > MAX_BYTES) return 'ไฟล์ใหญ่เกิน 20 MB';
  return null;
}
export function normalizeMime(name, mime) {
  const known = {heic:'image/heic',heif:'image/heif',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',pdf:'application/pdf'};
  return known[name.split('.').at(-1).toLowerCase()] || (/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mime || '') ? mime : 'application/octet-stream');
}
