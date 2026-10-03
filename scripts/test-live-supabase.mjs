// Run against two explicitly supplied, confirmed test accounts. Never stores
// privileged keys. Only test-created rows are removed during cleanup.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
function env(path){if(!fs.existsSync(path))return {};return Object.fromEntries(fs.readFileSync(path,'utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));}
const config={...env('.env'),...env('.env.test.local'),...process.env};
const names=['CADENCE_TEST_EMAIL_A','CADENCE_TEST_PASSWORD_A','CADENCE_TEST_EMAIL_B','CADENCE_TEST_PASSWORD_B'];
if(names.some(n=>!config[n])){console.error('Live verification is blocked: add two confirmed test accounts to .env.test.local using .env.test.example. No accounts or study records were created.');process.exit(2);}
assert.notEqual(config.CADENCE_TEST_EMAIL_A,config.CADENCE_TEST_EMAIL_B,'Two distinct accounts are required');
const client=()=>createClient(config.VITE_SUPABASE_URL,config.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const a=client(),b=client(),aDevice2=client(),anon=client();
const created={skill:randomUUID(),topic:randomUUID(),session:randomUUID()};
let userId;
async function login(c,email,password){const {data,error}=await c.auth.signInWithPassword({email,password});if(error)throw new Error(`Test account sign-in failed: ${error.message}`);return data.user.id;}
async function snapshot(c){const {data,error}=await c.rpc('cadence_snapshot');if(error)throw error;assert.ok(data,'Cadence profile is missing');return data;}
async function save(c,revision,changes){const {data,error}=await c.rpc('cadence_apply_changes',{expected_revision:revision,changes});if(error)throw error;return data;}
try{
 userId=await login(a,config.CADENCE_TEST_EMAIL_A,config.CADENCE_TEST_PASSWORD_A);
 const bId=await login(b,config.CADENCE_TEST_EMAIL_B,config.CADENCE_TEST_PASSWORD_B);assert.notEqual(userId,bId);
 const initial=await snapshot(a);assert.equal(initial.topicImportReady,true,'Apply the topic import priority migration before live verification');
 const sortOrder=Math.max(-1,...initial.data.topics.map(t=>t.sortOrder))+1;
 const stamp=new Date().toISOString(),date=new Date(),studyDate=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,time=date.toTimeString().slice(0,5);
 const sessionRow={id:created.session,skillId:created.skill,topicId:created.topic,topic:'Live integration verification',minutes:45,date:studyDate,time,startedAt:stamp,notes:'Dedicated account integration test',completed:true,createdAt:stamp};
 let s=await save(a,initial.revision,{skills:{upsert:[{id:created.skill,name:'Cadence integration test',targetHours:10,color:'#49cee3',createdAt:stamp}],delete:[]},topics:{upsert:[{id:created.topic,skillId:created.skill,name:sessionRow.topic,completedAt:null,createdAt:stamp,priority:'High',sortOrder}],delete:[]},sessions:{upsert:[sessionRow],delete:[]}});
 assert.equal(s.data.topics.find(t=>t.id===created.topic).priority,'High');assert.equal(s.data.topics.find(t=>t.id===created.topic).sortOrder,sortOrder);
 assert.equal(s.data.sessions.find(x=>x.id===created.session).minutes,45);
 assert.ok((await snapshot(a)).data.sessions.some(x=>x.id===created.session),'Refresh must retain the session');
 await login(aDevice2,config.CADENCE_TEST_EMAIL_A,config.CADENCE_TEST_PASSWORD_A);
 assert.equal((await snapshot(aDevice2)).data.sessions.find(x=>x.id===created.session).minutes,45,'Second device must receive the same database data');
 assert.ok(!(await snapshot(b)).data.sessions.some(x=>x.id===created.session),'User B must not see User A data');
 const {data:foreign}=await b.from('skills').select('id').eq('id',created.skill);assert.deepEqual(foreign,[]);
 const forged=await b.from('skills').insert({id:randomUUID(),user_id:userId,name:'Forbidden write'});assert.ok(forged.error,'RLS must reject forged ownership');
 const anonymous=await anon.rpc('cadence_snapshot');assert.ok(anonymous.error,'Anonymous RPC must be denied');
 const stale=await aDevice2.rpc('cadence_apply_changes',{expected_revision:initial.revision,changes:{}});assert.equal(stale.error?.code,'40001');
 s=await save(a,s.revision,{sessions:{upsert:[{...sessionRow,minutes:30,completed:false}],delete:[]}});assert.equal(s.data.sessions.find(x=>x.id===created.session).minutes,30);
 const signedOut=await a.auth.signOut({scope:'local'});assert.equal(signedOut.error,null);
 const afterLogout=await a.rpc('cadence_snapshot');assert.ok(afterLogout.error);
 await login(a,config.CADENCE_TEST_EMAIL_A,config.CADENCE_TEST_PASSWORD_A);assert.ok((await snapshot(a)).data.sessions.some(x=>x.id===created.session));
 s=await snapshot(a);s=await save(a,s.revision,{sessions:{upsert:[],delete:[created.session]}});assert.ok(!s.data.sessions.some(x=>x.id===created.session));
 console.log('PASS: live auth, user isolation, persistence, second-client sync, logout/login, session editing/deletion, anonymous denial, and revision conflicts.');
}finally{
 if(userId){await login(a,config.CADENCE_TEST_EMAIL_A,config.CADENCE_TEST_PASSWORD_A);const cleanup=await a.from('skills').delete().eq('id',created.skill).eq('user_id',userId);if(cleanup.error)throw new Error(`Test cleanup failed: ${cleanup.error.message}`);}
 await Promise.all([a,b,aDevice2].map(c=>c.auth.signOut({scope:'local'})));
}
