import { useState } from 'react';
import { PencilSimple, Trash, ArrowSquareOut, MapPin, Plus } from '@phosphor-icons/react';
import { Application, AppStatus, APP_STATUSES, uid } from './model';
import { Card, Empty } from './components';
export function ApplicationForm({app,today,onSave}:{app?:Application;today:string;onSave:(a:Application)=>void}){
  const [status,setStatus]=useState<AppStatus>(app?.status||'Applied');
  return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({id:app?.id||uid(),company:String(f.get('company')).trim(),role:String(f.get('role')||'').trim(),status,date:String(f.get('date')),url:String(f.get('url')||'').trim(),location:String(f.get('location')||'').trim(),notes:String(f.get('notes')||''),createdAt:app?.createdAt||new Date().toISOString()});}}>
    <label className="field-label" htmlFor="app-company">COMPANY</label><input id="app-company" name="company" required maxLength={200} pattern=".*\S.*" defaultValue={app?.company} placeholder="Where are you applying?"/>
    <label className="field-label" htmlFor="app-role">ROLE</label><input id="app-role" name="role" maxLength={200} defaultValue={app?.role} placeholder="e.g. Frontend Developer"/>
    <label className="field-label">STATUS</label><div className="skill-chips">{APP_STATUSES.map(s=><button key={s} type="button" className={`chip ${status===s?'chosen':''}`} aria-pressed={status===s} onClick={()=>setStatus(s)}>{s}</button>)}</div>
    <div className="form-columns"><div><label className="field-label" htmlFor="app-date">DATE APPLIED</label><input id="app-date" name="date" type="date" required defaultValue={app?.date||today}/></div><div><label className="field-label" htmlFor="app-location">LOCATION</label><input id="app-location" name="location" maxLength={200} defaultValue={app?.location} placeholder="City or Remote"/></div></div>
    <label className="field-label" htmlFor="app-url">JOB LINK</label><input id="app-url" name="url" type="url" maxLength={2000} defaultValue={app?.url} placeholder="https://"/>
    <label className="field-label" htmlFor="app-notes">NOTES</label><textarea id="app-notes" name="notes" maxLength={10000} defaultValue={app?.notes} placeholder="Contacts, interview dates, salary, follow-ups"/>
    <button className="primary full" style={{marginTop:22}}>{app?'Save application':'Add application'}</button>
  </form>;
}
const FILTERS=['All',...APP_STATUSES] as const;
export function ApplicationsPage({apps,today,onAdd,onEdit,onDelete,onStatus}:{apps:Application[];today:string;onAdd:()=>void;onEdit:(a:Application)=>void;onDelete:(a:Application)=>void;onStatus:(a:Application,s:AppStatus)=>void}){
  const [filter,setFilter]=useState<typeof FILTERS[number]>('All'),[query,setQuery]=useState('');
  const count=(s:AppStatus)=>apps.filter(a=>a.status===s).length, active=count('Applied')+count('Interviewing');
  const q=query.trim().toLowerCase(), shown=[...apps].filter(a=>(filter==='All'||a.status===filter)&&(!q||`${a.company} ${a.role}`.toLowerCase().includes(q))).sort((a,b)=>`${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
  const ago=(d:string)=>{const n=Math.round((new Date(`${today}T12:00:00`).getTime()-new Date(`${d}T12:00:00`).getTime())/86400000);return n<=0?'Today':n===1?'Yesterday':`${n} days ago`;};
  if(!apps.length) return <Card><Empty title="Track every application" description="Add the companies you apply to, then follow each one from applied to offer." action={<button className="primary small" onClick={onAdd}><Plus size={18}/>Add your first application</button>}/></Card>;
  return <>
    <div className="stats-grid app-stats"><Card><span className="eyebrow">TOTAL</span><div className="stat-number">{apps.length}</div></Card><Card><span className="eyebrow">IN PROGRESS</span><div className="stat-number">{active}</div></Card><Card><span className="eyebrow">INTERVIEWING</span><div className="stat-number">{count('Interviewing')}</div></Card><Card><span className="eyebrow">OFFERS</span><div className="stat-number">{count('Offer')}</div></Card></div>
    <Card><div className="card-heading"><h2>Your applications</h2><span>{shown.length} of {apps.length}</span></div>
      <div className="app-toolbar"><div className="skill-chips">{FILTERS.map(f=><button key={f} className={`chip ${filter===f?'chosen':''}`} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f}{f!=='All'&&<small>{count(f)}</small>}</button>)}</div><label className="sr-only" htmlFor="app-search">Search applications</label><input id="app-search" type="search" placeholder="Search company or role" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      {shown.length?<div className="app-list">{shown.map(a=><div key={a.id} className="app-row inset"><div className="row-copy"><strong>{a.company}</strong><p>{a.role||'No role added'}{a.location&&<><span>·</span><MapPin size={13}/>{a.location}</>}<span>·</span>Applied {ago(a.date)}</p>{a.notes&&<em>{a.notes}</em>}</div>
        <label className="sr-only" htmlFor={`status-${a.id}`}>Status for {a.company}</label><select id={`status-${a.id}`} className={`app-status s-${a.status.toLowerCase()}`} value={a.status} onChange={e=>onStatus(a,e.target.value as AppStatus)}>{APP_STATUSES.map(s=><option key={s}>{s}</option>)}</select>
        {/^https?:\/\//i.test(a.url)&&<a className="icon-button subtle" href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`Open job link for ${a.company}`}><ArrowSquareOut size={17}/></a>}
        <button className="icon-button subtle" aria-label={`Edit application ${a.company}`} onClick={()=>onEdit(a)}><PencilSimple size={17}/></button><button className="icon-button subtle" aria-label={`Delete application ${a.company}`} onClick={()=>onDelete(a)}><Trash size={17}/></button></div>)}</div>:<Empty title="No matches" description="Try a different status or search."/>}
    </Card>
  </>;
}
