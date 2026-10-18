import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, SignalLow } from 'lucide-react';
import { flushOutbox, lowDataEnabled, outboxCount, setLowDataEnabled } from '@/lib/offlineSync';

export function NetworkStatusBanner(){const[online,setOnline]=useState(navigator.onLine);const[count,setCount]=useState(0);const[syncing,setSyncing]=useState(false);const[low,setLow]=useState(lowDataEnabled());
 useEffect(()=>{const refresh=()=>void outboxCount().then(setCount);const up=()=>{setOnline(true);setSyncing(true);void flushOutbox().finally(()=>{setSyncing(false);refresh()})};const down=()=>setOnline(false);window.addEventListener('online',up);window.addEventListener('offline',down);window.addEventListener('resqnet-sync-change',refresh);refresh();if(navigator.onLine)void flushOutbox().then(refresh);return()=>{window.removeEventListener('online',up);window.removeEventListener('offline',down);window.removeEventListener('resqnet-sync-change',refresh)}} ,[]);
 const toggle=()=>{const next=!low;setLow(next);setLowDataEnabled(next)};
 if(online&&!count&&!low)return null;
 return <div className={`sticky top-0 z-[1000] flex flex-wrap items-center justify-center gap-3 px-3 py-2 text-xs ${online?'bg-blue-700':'bg-amber-700'} text-white`} role="status">{!online?<><CloudOff size={14}/>Offline · actions will be queued</>:syncing?<><RefreshCw size={14} className="animate-spin"/>Synchronizing</>:count?<><RefreshCw size={14}/>{count} queued action{count===1?'':'s'}</>:null}<button className="rounded border border-white/40 px-2 py-1" onClick={toggle}><SignalLow size={13} className="inline mr-1"/>Low-data {low?'on':'off'}</button></div>}
