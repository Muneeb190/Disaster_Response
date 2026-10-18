import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { LocationPicker } from '@/components/map/IncidentMap';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast-context';

const NEEDS = [['elderly','Older person'],['disabled','Disabled'],['wheelchair','Wheelchair'],['bedbound','Bedridden'],['pregnant','Pregnant'],['cannot_walk','Cannot walk'],['chronic_condition','Chronic illness'],['needs_medicine','Needs medicine'],['oxygen_dependency','Uses oxygen'],['dialysis','Dialysis'],['lives_alone','Lives alone'],['no_phone','Limited phone access'],['power_dependency','Needs electricity'],['limited_transport','No transport']];

export function AtRiskRegisterPage() {
  const { toast } = useToast(); const [name,setName]=useState(''); const [phone,setPhone]=useState(''); const [language,setLanguage]=useState('en');
  const [needs,setNeeds]=useState<string[]>([]); const [coords,setCoords]=useState<[number,number]|null>(null); const [consent,setConsent]=useState(false); const [reference,setReference]=useState(''); const [saving,setSaving]=useState(false);
  const submit=async()=>{if(!coords||!consent){toast('Confirm consent and choose a location','warning');return;}setSaving(true);const {data,error}=await supabase.rpc('register_at_risk',{p_full_name:name,p_phone:phone,p_preferred_language:language,p_needs:needs,p_latitude:coords[0],p_longitude:coords[1],p_consent:consent});setSaving(false);if(error)toast(error.message,'error');else setReference(String(data));};
  return <main className="min-h-screen bg-neutral-50 px-4 py-8"><div className="mx-auto max-w-2xl">
    <Link to="/" className="text-sm text-primary-700">← ResQNet home</Link><div className="card card-body mt-4">
    <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="text-primary-600"/>At-risk assistance register</h1>
    <p className="mt-2 text-sm text-neutral-600">Voluntarily share contact and support needs so coordinators can send warnings and check on you during an emergency. This is not an emergency report.</p>
    {reference ? <div className="mt-6 rounded-lg bg-green-50 p-5 text-green-800"><strong>Registration saved.</strong><p className="mt-1">Reference: {reference}</p><Link to="/report" className="btn-primary mt-4">Report an emergency</Link></div> : <div className="mt-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3"><div><label className="label">Full name</label><input className="input" value={name} onChange={e=>setName(e.target.value)}/></div><div><label className="label">Reachable phone</label><input className="input" value={phone} onChange={e=>setPhone(e.target.value)}/></div></div>
      <div><label className="label">Preferred language</label><select className="select" value={language} onChange={e=>setLanguage(e.target.value)}><option value="en">English</option><option value="ur">Urdu</option></select></div>
      <div><label className="label">Support needs</label><div className="flex flex-wrap gap-2">{NEEDS.map(([v,l])=><label key={v} className="rounded-full border px-3 py-2 text-xs"><input type="checkbox" className="mr-1.5" checked={needs.includes(v)} onChange={e=>setNeeds(c=>e.target.checked?[...c,v]:c.filter(x=>x!==v))}/>{l}</label>)}</div></div>
      <div><label className="label">Home / usual location</label><LocationPicker onPick={(lat,lng)=>setCoords([lat,lng])}/></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I consent to ResQNet storing these details for emergency warnings and welfare checks. Coordinators can deactivate my registration.</span></label>
      <button className="btn-primary" disabled={saving||!name.trim()||!phone.trim()} onClick={()=>void submit()}>{saving?'Saving…':'Join register'}</button>
    </div>}</div></div></main>;
}
