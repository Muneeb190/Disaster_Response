import { openDB } from 'idb';
import { supabase } from '@/lib/supabase';
import { uploadIncidentPhoto } from '@/lib/evidence';

export type OfflineOperation = { id:string; kind:'public_report'|'responder_action'|'photo_upload'; payload:Record<string,unknown>; attachment?:File; createdAt:string };
const dbPromise=openDB('resqnet-offline',1,{upgrade(db){if(!db.objectStoreNames.contains('outbox'))db.createObjectStore('outbox',{keyPath:'id'});if(!db.objectStoreNames.contains('cache'))db.createObjectStore('cache');}});

export async function queueOffline(kind:OfflineOperation['kind'],payload:Record<string,unknown>,attachment?:File){const operation={id:crypto.randomUUID(),kind,payload,attachment,createdAt:new Date().toISOString()};await(await dbPromise).put('outbox',operation);window.dispatchEvent(new Event('resqnet-sync-change'));return operation.id;}
export async function outboxCount(){return(await(await dbPromise).getAllKeys('outbox')).length;}
export async function cacheAssignments(value:unknown){await(await dbPromise).put('cache',value,'assignments');}
export async function cachedAssignments<T>(){return(await(await dbPromise).get('cache','assignments'))as T|undefined;}

export async function flushOutbox(){
 if(!navigator.onLine)return{sent:0,remaining:await outboxCount()};
 const db=await dbPromise;const operations=(await db.getAll('outbox') as OfflineOperation[]).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));let sent=0;
 for(const operation of operations){
  if(operation.kind==='photo_upload'){
   if(lowDataEnabled())continue;
   try{await uploadIncidentPhoto(operation.attachment!,String(operation.payload.report_code),String(operation.payload.tracking_token));await db.delete('outbox',operation.id);sent++;continue}catch{break}
  }
  const call=operation.kind==='public_report'?supabase.rpc('sync_public_report',{p_idempotency_key:operation.id,p_payload:operation.payload}):supabase.rpc('sync_responder_action',{p_idempotency_key:operation.id,...operation.payload});
  const{data,error}=await call;if(error){if(operation.kind==='responder_action'){await supabase.rpc('record_sync_conflict',{p_idempotency_key:operation.id,p_operation_type:operation.kind,p_payload:operation.payload,p_error:error.message});await db.delete('outbox',operation.id);continue}break}
  if(operation.kind==='public_report'&&operation.attachment&&data){const receipt=data as{report_code?:string;tracking_token?:string};if(receipt.report_code&&receipt.tracking_token)await queueOffline('photo_upload',{report_code:receipt.report_code,tracking_token:receipt.tracking_token},operation.attachment)}
  await db.delete('outbox',operation.id);sent++;
 }
 window.dispatchEvent(new Event('resqnet-sync-change'));return{sent,remaining:await outboxCount()};
}

export function lowDataEnabled(){return localStorage.getItem('resqnet_low_data')==='true';}
export function setLowDataEnabled(enabled:boolean){localStorage.setItem('resqnet_low_data',String(enabled));window.dispatchEvent(new Event('resqnet-low-data'));}
