'use client';
import { itemTimeLabel } from '@/lib/item-dates';
import { useState, type ReactNode } from 'react';
import { TYPE_LABELS, STATUS_LABELS, type Item } from '@/lib/model';
export function meetingUrl(location: string): string | null {
  const match = location.match(/https?:\/\/[^\s<>]+/i);
  if (!match) return null;
  try { const url = new URL(match[0]); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function MeetingLink({ item }: { item: Item }) {
  const url = item.type === 'meeting' ? meetingUrl(item.location) : null;
  return url ? <a className="meeting-link" href={url} target="_blank" rel="noopener noreferrer">Open meeting ↗</a> : null;
}
// Opens below the tag, or above it when there is no room, so it never covers the tag.
function previewPosition(tag: HTMLElement) {
  const rect = tag.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 308));
  return rect.bottom > window.innerHeight - 310 && rect.top > window.innerHeight - rect.bottom
    ? { left, bottom: window.innerHeight - rect.top }
    : { left, top: rect.bottom };
}
function ItemLink({ url }: { url: string }) {
  const href = meetingUrl(url);
  return href ? <p><a href={href} target="_blank" rel="noopener noreferrer">{url}</a></p> : null;
}
export default function EventPreview({item, owner, children, className = ""}: {item:Item;owner?:string;children:ReactNode;className?:string}) {
  const [position,setPosition] = useState<{left:number;top?:number;bottom?:number}|null>(null);
  return <div className={`event-preview-wrap ${className}`.trim()} onMouseEnter={event=>setPosition(previewPosition(event.currentTarget))} onMouseLeave={()=>setPosition(null)} onFocus={event=>setPosition(previewPosition(event.currentTarget))} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setPosition(null);}} onKeyDown={event=>{if(event.key==='Escape')setPosition(null);}}>
    {children}{position && <div className="event-preview" style={position} role="region" aria-label="Item preview"><div className="preview-meta"><small>{TYPE_LABELS[item.type]} · {STATUS_LABELS[item.status]}</small><span className={`preview-priority ${item.priority}`}>Priority: {item.priority === "high" ? "High" : "Normal"}</span></div><strong>{item.title}</strong><p>{item.date} · {itemTimeLabel(item)}</p>{owner && <p>{owner}</p>}{item.location && <p>{item.location}</p>}{item.description && <p>{item.description}</p>}<ItemLink url={item.url}/><MeetingLink item={item}/></div>}
  </div>;
}
