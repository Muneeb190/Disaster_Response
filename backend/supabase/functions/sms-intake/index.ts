import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-webhook-secret","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL')!;const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const admin=createClient(url,service);
 const secret=Deno.env.get('SMS_WEBHOOK_SECRET');const supplied=req.headers.get('x-webhook-secret');const auth=req.headers.get('authorization')||'';
 let permitted=!!secret&&supplied===secret;
 if(!permitted&&auth){const userClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});const{data:{user}}=await userClient.auth.getUser();if(user){const{data}=await admin.from('user_roles').select('role').eq('user_id',user.id).eq('role','admin').maybeSingle();permitted=!!data;}}
 if(!permitted)return json({error:'Unauthorized'},401);
 try{const body=await req.json() as{provider_message_id?:string;from?:string;message?:string;latitude?:number;longitude?:number;simulation?:boolean};const message=(body.message||'').trim();if(message.length<5)return json({error:'Message is too short'},400);
  const lower=message.toLowerCase();const type=lower.includes('flood')||lower.includes('water')?'flood':lower.includes('fire')?'fire':lower.includes('heat')?'heatwave':lower.includes('injur')||lower.includes('medical')?'medical_emergency':'other';
  let incidentId:null|string=null;let status='needs_review';
  if(Number.isFinite(body.latitude)&&Number.isFinite(body.longitude)){const{data,error}=await admin.rpc('submit_public_incident_v2',{p_type:type,p_description:`SMS report: ${message}`,p_area_landmark:'SMS supplied location',p_people_affected:1,p_people_trapped:'unknown',p_injuries_reported:'unknown',p_vulnerable_people:'unknown',p_danger_increasing:'unknown',p_latitude:body.latitude,p_longitude:body.longitude,p_reporter_name:null,p_reporter_phone:body.from||null,p_ai_extracted:{source:'sms'},p_is_proxy_report:false,p_vulnerability_flags:[]});if(error)throw error;incidentId=data?.id??null;status='incident_created';}
  const masked=body.from?`***${body.from.slice(-4)}`:'unknown';const{data:row,error}=await admin.from('sms_inbox').insert({provider_message_id:body.provider_message_id||crypto.randomUUID(),sender_masked:masked,message,parsed_payload:{type,latitude:body.latitude,longitude:body.longitude},incident_id:incidentId,status,is_simulation:body.simulation!==false}).select('id,status,incident_id').single();if(error)throw error;return json(row,201);
 }catch(error){console.error(error);return json({error:'SMS intake failed'},502);}
});
