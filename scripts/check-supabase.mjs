import fs from 'node:fs';

const values = { ...Object.fromEntries(fs.readFileSync('.env', 'utf8')
  .split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; })), ...process.env };
const url = values.VITE_SUPABASE_URL, key = values.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Configure the public Supabase variables in .env.');
const headers = { apikey: key, 'Content-Type': 'application/json' };
const checks = [
  { endpoint: '/auth/v1/settings' },
  ...['profiles', 'skills', 'topics', 'study_sessions', 'study_plans'].map(table => ({ endpoint: `/rest/v1/${table}?select=${table === 'topics' ? 'id,priority,sort_order' : 'id'}&limit=0` })),
  { endpoint: '/rest/v1/rpc/cadence_snapshot', body: {} },
  { endpoint: '/rest/v1/rpc/cadence_apply_changes', body: { expected_revision: 0, changes: {} } },
];
for (const { endpoint, body } of checks) {
  const response = await fetch(url + endpoint, {
    headers, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  const settings = endpoint.includes('settings');
  const passed = settings ? response.ok : [401, 403].includes(response.status) && result.code === '42501';
  console.log(JSON.stringify({ endpoint, status: response.status, passed,
    ...(settings ? { signupDisabled: result.disable_signup, autoConfirm: result.mailer_autoconfirm }
      : { code: result.code, message: result.message }) }));
  if (!passed) process.exitCode = 1;
}
console.log('These checks verify endpoint presence and anonymous denial. They do not inspect installed RLS policies or prove authenticated user isolation.');
