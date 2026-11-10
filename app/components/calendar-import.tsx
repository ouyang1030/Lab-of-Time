"use client";
import { useState } from 'react';
import Dialog from './dialog';
import type { ImportedEvent } from '@/lib/import-calendar';
import type { CalendarSubscription, Item, Mutate } from '@/lib/model';
import { itemTimeLabel } from '@/lib/item-dates';
type Preview = {text:string;events:(ImportedEvent & {duplicate:boolean})[];warnings:string[]};
export default function CalendarImport({onClose,onCommand,items,subscriptions,memberId}:{onClose:()=>void;onCommand:Mutate;items:Item[];subscriptions:CalendarSubscription[];memberId:string}) {
  const [text,setText] = useState(''), [url,setUrl] = useState('');
  const [sourceName,setSourceName] = useState('External calendar');
  const [from,setFrom] = useState(()=>{const d=new Date();d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,10);});
  const [to,setTo] = useState(()=>{const d=new Date();d.setUTCFullYear(d.getUTCFullYear()+1);return d.toISOString().slice(0,10);});
  const [preview,setPreview] = useState<Preview|null>(null);
  const [selected,setSelected] = useState<string[]>([]);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [confirmBatch,setConfirmBatch] = useState(''), [confirmFeed,setConfirmFeed] = useState('');
  const run = async (command:Record<string,unknown>) => {setBusy(true);try{return await onCommand(command);}finally{setBusy(false);}};
  const batches = new Map<string,Item[]>();
  for(const item of items) if(item.importBatch && item.importedBy===memberId) batches.set(item.importBatch,[...(batches.get(item.importBatch)||[]),item]);
  async function inspect() {
    setBusy(true); setError(''); setPreview(null);
    try {
      const response = await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'previewCalendar',sourceName,from,to,...(url.trim()?{url:url.trim()}:{text})})});
      const data = await response.json() as Preview & {error?:string}; if(!response.ok) throw new Error(data.error);
      setPreview(data); setSelected([...new Set(data.events.filter(event=>!event.duplicate).map(event=>event.key))].slice(0,100));
    } catch(e) { setError(e instanceof Error?e.message:'Could not read calendar'); }
    finally {setBusy(false);}
  }
  return <Dialog title="Import calendar" onClose={()=>{if(!busy)onClose();}} wide>
    <p>Imported meetings are visible to everyone in this lab and assigned to you. Import once from a file or URL, or subscribe to a URL to keep it in sync.</p>
    <p>Times use Europe/Vienna. Recurring events become independent meetings within the selected dates. Floating times use Vienna local time.</p>
    <fieldset disabled={busy} className="calendar-import-fields">
      <label className="field">Calendar name<input maxLength={100} required value={sourceName} onChange={e=>{setSourceName(e.target.value);setPreview(null);}}/><small>Reuse this name when importing the same calendar. Existing meetings are preserved.</small></label>
      <div className="form-grid"><label className="field">From<input type="date" required value={from} onChange={e=>{setFrom(e.target.value);setPreview(null);}}/></label><label className="field">Through<input type="date" required min={from} value={to} onChange={e=>{setTo(e.target.value);setPreview(null);}}/></label></div>
      <label className="field">ICS file<input type="file" accept=".ics,text/calendar" onChange={async e=>{
        setPreview(null);setError('');setText('');setUrl('');const file=e.target.files?.[0];if(!file)return;
        if(file.size>2000000){setError('Calendar exceeds the 2 MB limit');return;}
        setBusy(true);try{setText(await file.text());}catch{setError('Could not read file');}finally{setBusy(false);}
      }}/></label>
      <label className="field">Or calendar URL<input type="url" value={url} placeholder="https://… .ics or webcal://…" onChange={e=>{setUrl(e.target.value);setPreview(null);}}/><small>Any public HTTPS or webcal feed: Google, Outlook, iCloud / Mac Calendar public links, university or course calendars.</small></label>
      <button className="button primary" disabled={(!text&&!url.trim())||!sourceName.trim()||!from||!to||from>to} onClick={()=>void inspect()}>{busy?'Processing…':'Preview import'}</button>
      {preview&&<><p role="status">{preview.events.filter(e=>!e.duplicate).length} available · {preview.events.filter(e=>e.duplicate).length} already imported · {preview.warnings.length} warnings</p>
        {!preview.events.length&&<p>No events in the selected date range.</p>}
        <div className="calendar-import-events">{preview.events.map(event=><label key={event.key} className="calendar-import-event"><input type="checkbox" disabled={event.duplicate} checked={selected.includes(event.key)} onChange={e=>setSelected(keys=>e.target.checked?[...keys,event.key]:keys.filter(key=>key!==event.key))}/><span>{event.title}<br/>{event.date} · {itemTimeLabel({...event,type:'meeting'})}{event.duplicate?' · Already imported':''}</span></label>)}</div>
        {preview.warnings.length>0&&<details><summary>Warnings ({preview.warnings.length})</summary><ul>{preview.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></details>}
        <p>Select up to 100 meetings per import. Previously imported meetings are never overwritten.</p>
        <button className="button primary" disabled={!selected.length||selected.length>100} onClick={async()=>{if(await run({action:'importCalendar',text:preview.text,keys:selected,sourceName,from,to}))onClose();}}>Import {selected.length} meetings</button>
        {url.trim()&&<><p>Or subscribe: all events from one month ago to one year ahead sync automatically every 12 hours. External changes update meetings you have not edited; your local edits are kept.</p>
        <button className="button" disabled={subscriptions.some(feed=>feed.name===sourceName.trim())} onClick={async()=>{if(await run({action:'subscribeCalendar',url:url.trim(),sourceName:sourceName.trim()})){setPreview(null);setUrl('');}}}>{subscriptions.some(feed=>feed.name===sourceName.trim())?'Name already subscribed':'Subscribe & sync every 12h'}</button></>}
      </>}
      {subscriptions.length>0&&<details open><summary>Your subscriptions ({subscriptions.length})</summary>{subscriptions.map(feed=><div key={feed.id} className="calendar-import-batch">
        <span>{feed.name} · {feed.host}<br/><small className={feed.lastOk?undefined:'form-error'}>{feed.lastSyncAt?`${feed.lastOk?'Synced':'Failed'} ${new Date(feed.lastSyncAt).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'})} · ${feed.lastMessage}`:'Not synced yet'}</small></span>
        <span className="calendar-import-actions"><button className="button" onClick={()=>void run({action:'syncSubscription',id:feed.id})}>Sync now</button>
        {confirmFeed===feed.id?<><button className="button" onClick={async()=>{if(await run({action:'unsubscribeCalendar',id:feed.id,removeEvents:false}))setConfirmFeed('');}}>Stop, keep meetings</button><button className="button" onClick={async()=>{if(await run({action:'unsubscribeCalendar',id:feed.id,removeEvents:true}))setConfirmFeed('');}}>Stop & remove unedited</button></>:<button className="button" onClick={()=>setConfirmFeed(feed.id)}>Stop sync</button>}</span>
      </div>)}</details>}
      {batches.size>0&&<details><summary>Your imported batches ({batches.size})</summary><p>Undo removes unedited meetings only. Edited, reassigned or RSVP’d meetings are preserved.</p>{[...batches].map(([id,entries])=><div key={id} className="calendar-import-batch"><span>{entries[0].sourceName} · {entries.length} meetings</span><button className="button" onClick={async()=>{if(confirmBatch!==id){setConfirmBatch(id);return;}await run({action:'undoCalendarImport',batch:id});setConfirmBatch('');setPreview(null);}}>{confirmBatch===id?'Confirm undo':'Undo batch'}</button></div>)}</details>}
    </fieldset>{error&&<p role="alert" className="form-error">{error}</p>}
  </Dialog>;
}
