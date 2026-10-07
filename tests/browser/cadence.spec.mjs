import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { completedWorkbook } from './workbook.mjs';

// Browser integration uses the real SDK and migration with isolated PostgreSQL.
// Auth HTTP is simulated; no accounts, emails, or rows reach the live project.
test('auth, PostgreSQL persistence, calculations, and two-user isolation through the browser', async ({ page, context, browser }) => {
  const db = new PGlite();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const accounts = new Map();
  const sessions = new Map();
  let failNextSave = false;
  const password = 'isolated-test-password';
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/migrations/202610030001_cadence.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/202610030002_topic_import.sql', 'utf8'));
  const catalog = await db.exec(fs.readFileSync('supabase/verify-cadence.sql', 'utf8'));
  const metadata = JSON.parse(catalog.find(result => result.rows.length)?.rows[0].cadence_schema_verification);
  expect(metadata.tables).toHaveLength(5);
  expect(metadata.policies).toHaveLength(5);
    for (const table of metadata.tables) {
    expect(table.rls_enabled).toBe(true);
    expect(table.anonymous_select).toBe(false);
    expect(table.authenticated_crud).toBe(true);
  }
  for (const policy of metadata.policies) {
    expect(policy.roles).toEqual(['authenticated']);
    expect(policy.command).toBe('ALL');
    expect(policy.using).toContain('auth.uid()');
    expect(policy.with_check).toContain('auth.uid()');
  }
  for (const fn of metadata.functions) {
    expect(fn.anonymous_execute).toBe(false);
    expect(fn.security_definer).toBe(fn.name === 'handle_new_cadence_user');
  }
  async function addAccount(email, name) {
    const user = { id: randomUUID(), email, aud: 'authenticated', role: 'authenticated',
      created_at: new Date().toISOString(), user_metadata: { display_name: name }, app_metadata: { provider: 'email', providers: ['email'] } };
    accounts.set(email, user);
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2::jsonb)', [user.id, JSON.stringify(user.user_metadata)]);
    return user;
  }
  const a = await addAccount('a@example.test', 'User A');
  await addAccount('b@example.test', 'User B');
  function authSession(user) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access_token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp, aud: 'authenticated' })).toString('base64url')}.isolated`;
    sessions.set(access_token, user);
    return { access_token, refresh_token: `refresh-${user.id}`, expires_in: 3600, expires_at: exp, token_type: 'bearer', user };
  }
  async function installRoutes(client) {
    await client.routeWebSocket('**/realtime/v1/**', socket => socket.close());
    await client.route('**/auth/v1/**', async route => {
      const req = route.request(), url = new URL(req.url());
      const payload = req.postDataJSON() || {};
      let result, status = 200;
      if (url.pathname.endsWith('/signup')) result = await addAccount(payload.email, payload.data?.display_name || '');
      else if (url.pathname.endsWith('/token')) {
        const user = accounts.get(payload.email);
        if (!user || payload.password !== password) { status = 400; result = { message: 'Invalid login credentials', error_code: 'invalid_credentials' }; }
        else result = authSession(user);
      } else if (url.pathname.endsWith('/user')) result = sessions.get(req.headers().authorization?.replace('Bearer ', ''));
      else if (url.pathname.endsWith('/logout')) result = {};
      else { status = 400; result = { message: 'Unexpected isolated auth request' }; }
      await route.fulfill({ status, json: result || {} });
    });
    await client.route('**/rest/v1/**', async route => {
      const req = route.request(), url = new URL(req.url());
      if (failNextSave && url.pathname.endsWith('/cadence_apply_changes')) {
        failNextSave = false;
        await route.fulfill({ status: 503, json: { code: 'SERVICE_UNAVAILABLE', message: 'Test connection unavailable' } });
        return;
      }
      const user = sessions.get(req.headers().authorization?.replace('Bearer ', ''));
      try {
        const result = await db.transaction(async tx => {
          await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
          await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user?.id || '']);
          if (url.pathname.endsWith('/cadence_snapshot')) return (await tx.query('select public.cadence_snapshot() as snapshot')).rows[0].snapshot;
          if (url.pathname.endsWith('/cadence_apply_changes')) {
            const { expected_revision, changes } = req.postDataJSON();
            return (await tx.query('select public.cadence_apply_changes($1,$2::jsonb) as snapshot', [expected_revision, JSON.stringify(changes)])).rows[0].snapshot;
          }
          throw new Error(`Unexpected isolated REST request: ${url.pathname}`);
        });
        await route.fulfill({ json: result });
      } catch (error) {
        await route.fulfill({ status: 400, json: { code: error.code, message: error.message } });
      }
    });
  }
  async function login(client, email) {
    await client.getByLabel('EMAIL', { exact: true }).fill(email);
    await client.getByLabel('PASSWORD', { exact: true }).fill(password);
    await client.getByRole('button', { name: 'Sign In', exact: true }).click();
  }
  async function logout(client) {
    await client.getByRole('button', { name: 'Settings', exact: true }).click();
    await client.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(client.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  }
  async function screenshot(name) {
    await page.screenshot({ path: `test-results/browser/${name}.png`, fullPage: true });
  }
  let second;
  try {
    await installRoutes(context);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await screenshot('login-desktop');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByLabel('NAME', { exact: true }).fill('New learner');
    await page.getByLabel('EMAIL', { exact: true }).fill('new@example.test');
    await page.getByLabel('PASSWORD', { exact: true }).fill(password);
    await page.getByLabel('CONFIRM PASSWORD', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Check your email');
    await page.getByRole('button', { name: 'Back to Sign In' }).click();
    await login(page, a.email);
    await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
    await page.getByLabel('TOPICS FOR YOUR FIRST SKILL (OPTIONAL)').fill('Closures');
    await page.getByRole('button', { name: 'Create my study space' }).click();
    await expect(page.locator('.mini-stats .inset').filter({ hasText: 'STUDIED' })).toContainText('0m');
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
    await page.getByLabel('TOPIC', { exact: true }).fill('  CLOS  ');
    await expect(page.locator('.topic-chips .topic-chip-select')).toHaveCount(1);
    await page.getByLabel('TOPIC', { exact: true }).fill('Custom reading');
    await expect(page.locator('.topic-chips .topic-chip-select')).toHaveCount(0);
    await expect(page.locator('.session-form').getByRole('status')).toContainText('No matching topics');
    await page.getByLabel('TOPIC', { exact: true }).fill('');
    await expect(page.locator('.topic-chips .topic-chip-select')).toHaveCount(1);
    await page.getByRole('button', { name: 'Delete topic Closures', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Delete this topic?');
    await expect(page.getByLabel('TOPIC', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.topic-chips .topic-chip-select')).toHaveCount(1);
    await page.getByRole('button', { name: 'Closures', exact: true }).click();
    await page.getByLabel('NOTES', { exact: true }).fill('Browser integration verification');
    await page.getByRole('switch', { name: 'Mark topic complete' }).click();
    await page.getByRole('button', { name: 'Add 45m of JavaScript', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit session Closures' })).toBeVisible();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator('.mini-stats .inset').filter({ hasText: 'STUDIED' })).toContainText('45m');
    await expect(page.locator('.hero-number')).toHaveText('15m');
    await expect(page.getByText('75% of today’s target')).toBeVisible();
    await screenshot('today-desktop');
    await page.reload();
    await expect(page.locator('.hero-number')).toHaveText('15m');
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toHaveCount(0);
    for (const name of ['Skills', 'Log', 'Streak', 'Analytics', 'Settings']) {
      await page.getByRole('button', { name, exact: true }).click();
      if (name === 'Skills') await expect(page.getByText('100%', { exact: true })).toBeVisible();
      if (name === 'Streak') await expect(page.locator('.stats-grid .glass').first().locator('.stat-number')).toHaveText('1days');
      if (name === 'Analytics') {
        await expect(page.locator('.analytics-hours')).toContainText('0.8h over the last 14 days');
        await expect(page.locator('.completion-content')).toContainText('1 topics completed');
        for (const mode of ['Weekly', 'Monthly', 'Daily']) await page.getByRole('button', { name: mode, exact: true }).click();
        await expect(page.locator('.recharts-surface').first()).toBeVisible();
      }
      await screenshot(`${name.toLowerCase()}-desktop`);
    }
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const name of ['Today', 'Skills', 'Log', 'Streak', 'Analytics', 'Settings']) {
        await page.getByRole('button', { name, exact: true }).click();
        const overflow = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
          elements: [...document.querySelectorAll('main *')].filter(element => element.getBoundingClientRect().right > window.innerWidth)
            .slice(0, 8).map(element => `${element.tagName}.${element.className}`) }));
        expect(overflow.scrollWidth, `${name} at ${width}px: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(width);
      }
      await page.getByRole('button', { name: 'Today', exact: true }).click();
      await screenshot(`today-mobile-${width}`);
    }
    second = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Kolkata' });
    await installRoutes(second);
    const device = await second.newPage();
    await device.goto('http://127.0.0.1:4173/');
    await login(device, a.email);
    await expect(device.locator('.hero-number')).toHaveText('15m');
    await logout(page);
    await login(page, 'b@example.test');
    await expect(page.getByRole('button', { name: 'Create my study space' })).toBeVisible();
    await page.getByRole('button', { name: 'Create my study space' }).click();
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    await expect(page.getByText('JavaScript', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit session Closures' })).toHaveCount(0);
    await logout(page);
    await login(page, a.email);
    await expect(page.locator('.hero-number')).toHaveText('15m');
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await page.getByRole('button', { name: 'Edit session Closures' }).click();
    await page.getByLabel('DURATION', { exact: true }).fill('30');
    await page.getByRole('switch', { name: 'Mark topic complete' }).click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator('.hero-number')).toHaveText('30m');
    await device.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(device.locator('.hero-number')).toHaveText('30m');
    await page.getByRole('button', { name: 'Streak', exact: true }).click();
    await expect(page.locator('.stats-grid .glass').first().locator('.stat-number')).toHaveText('0days');
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await page.getByRole('button', { name: 'Delete session Closures' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByText('No study sessions yet')).toBeVisible();
    // Excel flow: official download, exact row errors, atomic import, duplicate
    // prevention, separate skills, priority focus, actual time, reload, isolation.
    await page.setViewportSize({ width: 1360, height: 1000 });
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download Template', exact: true }).click();
    const templateDownload = await downloadEvent;
    expect(templateDownload.suggestedFilename()).toBe('Cadence_Blank_Topic_Template.xlsx');
    expect(fs.readFileSync(await templateDownload.path()).equals(fs.readFileSync('public/Cadence_Blank_Topic_Template.xlsx'))).toBe(true);
    await context.grantPermissions(['clipboard-read','clipboard-write']);
    await page.getByText('How to create your topic list', { exact: true }).click();
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByText('Prompt copied.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await page.locator('.topic-prompt').innerText());
    await page.getByRole('button', { name: 'Import Topics', exact: true }).click();
    await page.getByLabel('STEP 2 · UPLOAD EXCEL').setInputFiles('public/Cadence_Blank_Topic_Template.xlsx');
    await expect(page.locator('.import-preview')).toContainText('workbook has no topics');
    await page.getByLabel('STEP 2 · UPLOAD EXCEL').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});
    await expect(page.getByRole('alert').last()).toContainText('Choose an .xlsx');
    await page.getByLabel('STEP 2 · UPLOAD EXCEL').setInputFiles({name:'invalid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:completedWorkbook([['Valid topic','High'],[],['','Low'],['Invalid priority','Urgent']])});
    await expect(page.locator('.import-preview')).toContainText('Row 4:');
    await expect(page.locator('.import-preview')).toContainText('Row 5:');
    await expect(page.getByRole('button', { name: /Import \d+ Topics/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.skill-card')).toContainText('0 of 1 topics');
    async function uploadTopics(rows, skillName, create=false) {
      await page.getByRole('button', { name: 'Import Topics', exact: true }).click();
      if (create) { await page.getByLabel('STEP 1 · SELECT SKILL').selectOption('new'); await page.getByLabel('NEW SKILL NAME').fill(skillName); }
      else await page.getByLabel('STEP 1 · SELECT SKILL').selectOption({label:skillName});
      await page.getByLabel('STEP 2 · UPLOAD EXCEL').setInputFiles({name:'completed.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:completedWorkbook(rows)});
      await expect(page.locator('.import-preview')).toContainText(`${rows.length} topics found`);
      await page.getByRole('button', { name: `Import ${rows.length} Topics`, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    const jsRows = [['Events','Low'],[' Promises ','High'],['Lexical scope','High'],['Browser APIs','Medium']];
    await uploadTopics(jsRows,'JavaScript');
    await expect(page.locator('.skill-card')).toContainText('0 of 5 topics');
    await page.getByRole('button', { name: 'Import Topics', exact: true }).click();
    await page.getByLabel('STEP 2 · UPLOAD EXCEL').setInputFiles({name:'duplicates.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:completedWorkbook(jsRows)});
    await expect(page.locator('.import-preview')).toContainText('duplicates a topic');
    await expect(page.getByRole('button', { name: /Import \d+ Topics/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await uploadTopics([['Components & Props','High'],['useState','Medium']],'React.js',true);
    await expect(page.locator('.skill-card').filter({has:page.getByRole('heading',{name:'React.js',exact:true})})).toContainText('0 of 2 topics');
    await page.reload();
    await expect(page.locator('.skill-card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator('.topic-focus .row-copy strong')).toHaveText(['Promises','Lexical scope','Components & Props']);
    await expect(page.locator('.topic-focus')).not.toContainText('45m');
    await page.getByRole('button', {name:'Log time for Promises',exact:true}).click();
    await page.getByLabel('DURATION', {exact:true}).fill('20');
    await expect(page.getByRole('switch', { name: 'Mark topic complete' })).not.toBeChecked();
    await page.getByRole('button',{name:'Add 20m of JavaScript',exact:true}).click();
    await expect(page.getByRole('button',{name:'Edit session Promises'})).toBeVisible();
    await page.getByRole('button',{name:'Today',exact:true}).click();
    await expect(page.locator('.topic-focus .row-copy strong').first()).toHaveText('Promises');
    await page.getByRole('button',{name:'Log',exact:true}).click();
    await page.getByRole('button',{name:'Edit session Promises'}).click();
    await page.getByRole('switch', { name: 'Mark topic complete' }).click();
    await page.getByRole('button', {name:'Save changes',exact:true}).click();
    await page.getByRole('button',{name:'Today',exact:true}).click();
    await expect(page.locator('.topic-focus .row-copy strong')).toHaveText(['Lexical scope','Components & Props','Closures']);
    await expect(page.locator('.mini-stats .inset').filter({hasText:'STUDIED'})).toContainText('20m');
    await page.getByRole('button',{name:'Skills',exact:true}).click();
    await screenshot('excel-import-skills');
    await page.getByRole('button',{name:'Import Topics',exact:true}).click();
    await page.getByLabel('STEP 1 · SELECT SKILL').selectOption({label:'JavaScript'});
    await page.getByLabel('STEP 2 · UPLOAD EXCEL').setInputFiles({name:'preview.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:completedWorkbook([['Next topic','Medium']])});
    await expect(page.locator('.import-preview')).toContainText('1 topics found');
    const modalBounds=await page.getByRole('dialog').boundingBox();
    expect(Math.abs(modalBounds.x-(1360-modalBounds.width)/2)).toBeLessThan(2);
    await screenshot('excel-import-preview');
    await page.setViewportSize({width:320,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Import Topics',exact:true}).click();
    await page.getByLabel('STEP 1 · SELECT SKILL').selectOption('new');
    await page.getByLabel('NEW SKILL NAME').fill(' javascript ');
    await expect(page.getByRole('dialog')).toContainText('This skill already exists');
    await page.getByLabel('STEP 2 · UPLOAD EXCEL').setInputFiles({name:'retry.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:completedWorkbook([['Retry topic','Medium']])});
    await expect(page.locator('.import-preview')).toContainText('1 topics found');
    failNextSave = true;
    await page.getByRole('button',{name:'Import 1 Topics',exact:true}).click();
    await expect(page.getByRole('dialog')).toContainText('Test connection unavailable');
    await expect(page.locator('.import-preview')).toContainText('1 topics found');
    expect((await db.query('select count(*)::int as count from public.topics')).rows[0].count).toBe(7);
    await page.getByRole('button',{name:'Import 1 Topics',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.skill-card')).toHaveCount(2);
    expect((await db.query('select count(*)::int as count from public.topics')).rows[0].count).toBe(8);
    await page.reload();
    await expect(page.locator('.skill-card').filter({has:page.getByRole('heading',{name:'JavaScript',exact:true})})).toContainText('1 of 6 topics');
    await logout(page); await login(page,'b@example.test');
    await page.getByRole('button',{name:'Skills',exact:true}).click();
    await expect(page.locator('.skill-card')).toHaveCount(0);
    await logout(page); await login(page,a.email);
    await page.getByRole('button',{name:'Skills',exact:true}).click();
    await expect(page.locator('.skill-card')).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally {
    await second?.close();
    await context.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
    await db.close();
  }
});
