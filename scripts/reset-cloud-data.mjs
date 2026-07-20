const base = (process.env.KSM_BASE_URL || '').replace(/\/$/, '');
const key = process.env.KSM_RESET_KEY || '';
if (!base || !key) {
  console.error('Set KSM_BASE_URL and KSM_RESET_KEY before running this script.');
  process.exit(1);
}
const response = await fetch(`${base}/api/admin/reset`, { method:'DELETE', headers:{ 'x-ksm-reset-key':key } });
const text = await response.text();
console.log(`HTTP ${response.status}`);
console.log(text);
if (!response.ok) process.exit(1);
