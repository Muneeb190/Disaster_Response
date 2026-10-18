import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { LocationPicker } from '@/components/map/IncidentMap';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast-context';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { useLang } from '@/lib/i18n';

const NEEDS = ['elderly', 'disabled', 'wheelchair', 'bedbound', 'pregnant', 'cannot_walk', 'chronic_condition', 'needs_medicine', 'oxygen_dependency', 'dialysis', 'lives_alone', 'no_phone', 'power_dependency', 'limited_transport'] as const;

export function AtRiskRegisterPage() {
  const { toast } = useToast();
  const { t } = useLang();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState('ur');
  const [needs, setNeeds] = useState<string[]>([]);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [consent, setConsent] = useState(false);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!coords || !consent || !name.trim() || !phone.trim()) { toast(t('reg.missing'), 'warning'); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc('register_at_risk', { p_full_name: name, p_phone: phone, p_preferred_language: language, p_needs: needs, p_latitude: coords[0], p_longitude: coords[1], p_consent: consent });
    setSaving(false);
    if (error) toast(error.message, 'error'); else setReference(String(data));
  };

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />
      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-4xl font-bold">{t('reg.title')}</h1>
        <p className="mt-3 text-lg text-neutral-600">{t('reg.lead')}</p>
        <p className="mt-3 text-[15px] text-neutral-600">{t('reg.notReport')} <Link to="/report" className="font-semibold text-critical underline underline-offset-2">{t('nav.report')}</Link></p>

        {reference ? (
          <section className="card card-body mt-6">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-success-soft text-success"><Check size={24} aria-hidden="true" /></span><h2 className="text-2xl font-bold">{t('reg.done')}</h2></div>
            <p className="mt-3 text-neutral-600">{t('reg.doneBody')}</p>
            <p className="mt-4 flex items-center justify-between gap-2 rounded-control border border-line p-4" lang="en"><span className="font-display text-2xl font-bold">{reference}</span><button type="button" className="btn-ghost btn-sm" onClick={() => { void navigator.clipboard.writeText(reference); toast('Reference copied', 'success'); }}><Copy size={16} aria-hidden="true" />{t('report.copy')}</button></p>
          </section>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <section className="card card-body grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="reg-name" className="label">{t('reg.name')}</label><input id="reg-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
              <div><label htmlFor="reg-phone" className="label">{t('reg.phone')}</label><input id="reg-phone" className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /><p className="hint">{t('reg.phoneHint')}</p></div>
              <div><label htmlFor="reg-lang" className="label">{t('reg.language')}</label><select id="reg-lang" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="ur">اردو</option><option value="en">English</option></select></div>
            </section>
            <section className="card card-body">
              <fieldset>
                <legend className="font-display text-xl font-semibold">{t('reg.needs')}</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {NEEDS.map((need) => {
                    const on = needs.includes(need);
                    return (
                      <label key={need} className={`inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[15px] has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-primary-600 ${on ? 'border-primary-600 bg-primary-50 font-semibold text-primary-800' : 'border-line bg-surface hover:border-neutral-300'}`}>
                        <input type="checkbox" className="sr-only" checked={on} onChange={(e) => setNeeds((current) => e.target.checked ? [...current, need] : current.filter((item) => item !== need))} />
                        {on && <Check size={15} aria-hidden="true" />}{t(`need.${need}`)}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </section>
            <section className="card card-body">
              <h2 className="text-xl font-semibold">{t('reg.where')}</h2>
              <p className="mb-3 text-sm text-neutral-500">{t('reg.whereHint')}</p>
              <LocationPicker onPick={(lat, lng) => setCoords([lat, lng])} />
            </section>
            <label className="card flex cursor-pointer items-start gap-3 p-5">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-[15px] text-neutral-700">{t('reg.consent')}</span>
            </label>
            <button className="btn-primary btn-lg w-full" disabled={saving}>{saving ? t('reg.saving') : t('reg.submit')}</button>
          </form>
        )}
      </main>
    </div>
  );
}
