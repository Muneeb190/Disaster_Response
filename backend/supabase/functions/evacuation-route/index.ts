const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response(null,{headers:cors});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  const key=Deno.env.get('OPENROUTESERVICE_API_KEY');
  if(!key) return json({error:'Evacuation routing is not configured'},503);
  try{
    const body=await req.json() as {start?:number[];end?:number[];avoid_polygons?:unknown;profile?:string};
    if(!body.start||!body.end||body.start.length!==2||body.end.length!==2) return json({error:'Start and destination are required'},400);
    const profile=['driving-car','driving-hgv','foot-walking','wheelchair'].includes(body.profile||'')?body.profile:'driving-car';
    const payload:Record<string,unknown>={coordinates:[body.start,body.end],instructions:true};
    if(body.avoid_polygons) payload.options={avoid_polygons:body.avoid_polygons};
    const response=await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`,{method:'POST',headers:{Authorization:key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    const result=await response.json().catch(()=>null);
    if(!response.ok) return json({error:response.status===403?'Routing API key is invalid or unauthorized':'No safe route could be calculated'},response.status===429?429:502);
    return json(result);
  }catch(error){console.error(error);return json({error:'Routing service unavailable'},502);}
});
