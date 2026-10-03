import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const skill='33333333-3333-4333-8333-333333333333',topic='44444444-4444-4444-8444-444444444444',session='55555555-5555-4555-8555-555555555555';
before(async()=>{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/migrations/202610030001_cadence.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/202610030002_topic_import.sql','utf8'));
});
beforeEach(async()=>{await db.exec(`reset role;delete from auth.users;insert into auth.users(id,raw_user_meta_data) values ('${a}','{"display_name":"User A"}'),('${b}','{"display_name":"User B"}');`);});
after(async()=>{await db.close();});
async function asUser(id){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);}
async function snapshot(){return (await db.query('select public.cadence_snapshot() as snapshot')).rows[0].snapshot;}
async function save(revision,changes){return (await db.query('select public.cadence_apply_changes($1,$2::jsonb) as snapshot',[revision,JSON.stringify(changes)])).rows[0].snapshot;}
const changes=()=>({skills:{upsert:[{id:skill,name:'JavaScript',color:'#49cee3',targetHours:10,createdAt:new Date().toISOString()}],delete:[]},topics:{upsert:[{id:topic,skillId:skill,name:'Closures',completedAt:null,createdAt:new Date().toISOString()}],delete:[]},sessions:{upsert:[{id:session,skillId:skill,topicId:topic,topic:'Closures',minutes:45,notes:'Studied',date:'2026-10-03',time:'12:00',startedAt:'2026-10-03T06:30:00Z',completed:true,createdAt:new Date().toISOString()}],delete:[]},plans:{upsert:[],delete:[]},preferences:{dailyTarget:60,onboardingDone:true}});
test('profile trigger creates separate empty profiles with zero study data',async()=>{await asUser(a);const s=await snapshot();assert.equal(s.profile.displayName,'User A');assert.equal(s.data.preferences.dailyTarget,60);assert.deepEqual(s.data.sessions,[]);assert.deepEqual(s.data.skills,[]);const rows=await db.query('select id from public.profiles');assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].id,a);});
test('atomic save, reload, second-device load, and user switching preserve isolation',async()=>{await asUser(a);let s=await save(0,changes());assert.equal(s.data.sessions[0].minutes,45);assert.equal(s.data.skills[0].name,'JavaScript');assert.ok(s.revision>0);s=await snapshot();assert.equal(s.data.sessions.length,1);await asUser(b);assert.deepEqual((await snapshot()).data.sessions,[]);assert.equal((await db.query('select * from public.skills')).rows.length,0);await asUser(a);assert.equal((await snapshot()).data.sessions[0].minutes,45);});
test('RLS denies other-user insert, update, delete, and profile access',async()=>{await asUser(a);await save(0,changes());await asUser(b);assert.equal((await db.query('update public.skills set name=$1 where id=$2 returning id',['Stolen',skill])).rows.length,0);assert.equal((await db.query('delete from public.study_sessions where id=$1 returning id',[session])).rows.length,0);assert.equal((await db.query('select id from public.profiles where id=$1',[a])).rows.length,0);await assert.rejects(db.query('insert into public.skills(id,user_id,name) values($1,$2,$3)',['66666666-6666-4666-8666-666666666666',a,'Forbidden']),/row-level security/);await assert.rejects(save(0,changes()),/row-level security/);await asUser(a);assert.equal((await snapshot()).data.skills[0].name,'JavaScript');});
test('composite foreign keys reject references to another user’s skill and topic',async()=>{await asUser(a);await save(0,changes());await asUser(b);await assert.rejects(db.query('insert into public.topics(id,user_id,skill_id,name) values($1,$2,$3,$4)',['66666666-6666-4666-8666-666666666666',b,skill,'Forbidden']),/foreign key/);await assert.rejects(db.query('insert into public.study_sessions(id,user_id,skill_id,topic_id,topic_name,duration_minutes,started_at,study_date,study_time) values($1,$2,$3,$4,$5,45,now(),current_date,current_time)',['77777777-7777-4777-8777-777777777777',b,skill,topic,'Forbidden']),/foreign key/);});
test('anonymous callers have no table or RPC permissions',async()=>{await db.exec('reset role;set role anon;');await assert.rejects(db.query('select * from public.skills'),/permission denied/);await assert.rejects(snapshot(),/permission denied/);await assert.rejects(save(0,changes()),/permission denied/);});
test('stale revisions cannot overwrite another device’s changes',async()=>{await asUser(a);const s=await save(0,changes());await assert.rejects(save(0,{preferences:{dailyTarget:90,onboardingDone:true}}),/another device/);assert.equal((await snapshot()).data.preferences.dailyTarget,60);assert.equal((await save(s.revision,{preferences:{dailyTarget:90,onboardingDone:true}})).data.preferences.dailyTarget,90);});
test('invalid multi-table changes roll back all rows',async()=>{await asUser(a);const c=changes();c.sessions.upsert[0].minutes=-1;await assert.rejects(save(0,c),/check constraint/);const s=await snapshot();assert.deepEqual(s.data.skills,[]);assert.deepEqual(s.data.topics,[]);assert.equal(s.revision,0);});
test('editing and deleting sessions change the next snapshot',async()=>{await asUser(a);let s=await save(0,changes());const row=changes().sessions.upsert[0];s=await save(s.revision,{sessions:{upsert:[{...row,minutes:30,completed:false}],delete:[]}});assert.equal(s.data.sessions[0].minutes,30);assert.equal(s.data.sessions[0].completed,false);s=await save(s.revision,{sessions:{upsert:[],delete:[session]}});assert.deepEqual(s.data.sessions,[]);});
test('topic deletion preserves session time as unlinked history',async()=>{await asUser(a);const s=await save(0,changes());const next=await save(s.revision,{topics:{upsert:[],delete:[topic]}});assert.deepEqual(next.data.topics,[]);assert.equal(next.data.sessions[0].topicId,null);assert.equal(next.data.sessions[0].minutes,45);});
test('timer and fractional elapsed duration round-trip through PostgreSQL',async()=>{await asUser(a);const c=changes();c.sessions.upsert[0].minutes=65/60;c.timer={skillId:skill,topicId:topic,topic:'Closures',planId:null,elapsed:42,startedAt:null,date:'2026-10-03',time:'12:00'};const s=await save(0,c);assert.equal(s.data.timer.elapsed,42);assert.equal(s.data.sessions[0].minutes,65/60);});
test('skill deletion cascades only its owner’s related data',async()=>{await asUser(a);const s=await save(0,changes());const next=await save(s.revision,{skills:{upsert:[],delete:[skill]}});assert.deepEqual(next.data.skills,[]);assert.deepEqual(next.data.topics,[]);assert.deepEqual(next.data.sessions,[]);await asUser(b);assert.equal((await snapshot()).profile.id,b);});
test('imported priorities and order persist and imported topic RLS denies User B CRUD',async()=>{
  await asUser(a);const c=changes();c.sessions.upsert=[];
  c.topics.upsert[0]={...c.topics.upsert[0],priority:'High',sortOrder:1};
  c.topics.upsert.push({...c.topics.upsert[0],id:'66666666-6666-4666-8666-666666666666',name:'Low first',priority:'Low',sortOrder:0},
    {...c.topics.upsert[0],id:'77777777-7777-4777-8777-777777777777',name:'High second',sortOrder:2});
  const s=await save(0,c);assert.equal(s.topicImportReady,true);
  assert.deepEqual((await snapshot()).data.topics.map(t=>[t.name,t.priority,t.sortOrder]),[['Low first','Low',0],['Closures','High',1],['High second','High',2]]);
  await assert.rejects(save(s.revision,{topics:{upsert:[{...c.topics.upsert[0],priority:'Urgent'}],delete:[]}}),/check constraint/);
  assert.equal((await snapshot()).revision,s.revision);
  await asUser(b);assert.deepEqual((await snapshot()).data.topics,[]);
  assert.equal((await db.query('select id from public.topics where id=$1',[topic])).rows.length,0);
  assert.equal((await db.query("update public.topics set priority='Low' where id=$1 returning id",[topic])).rows.length,0);
  assert.equal((await db.query('delete from public.topics where id=$1 returning id',[topic])).rows.length,0);
  await assert.rejects(db.query('insert into public.topics(user_id,skill_id,name,priority) values($1,$2,$3,$4)',[a,skill,'Forbidden import','High']),/row-level security/);
  await asUser(a);assert.equal((await snapshot()).data.topics.length,3);
});
