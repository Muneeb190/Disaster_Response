import { useState } from 'react';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import type { IncidentType } from '@/types';

type Guidance = { en: string[]; ur: string[]; sourceUrl: string; sourceLabel: string };

const GUIDANCE: Record<IncidentType, Guidance> = {
  flood: {
    en: ['Move to higher ground if it is safe.', 'Do not walk, swim, or drive through flood water.', 'Keep children away from drains and moving water.'],
    ur: ['اگر محفوظ ہو تو فوراً اونچی جگہ پر جائیں۔', 'سیلابی پانی میں پیدل، تیر کر یا گاڑی سے داخل نہ ہوں۔', 'بچوں کو نالوں اور بہتے پانی سے دور رکھیں۔'],
    sourceUrl: 'https://www.ready.gov/floods', sourceLabel: 'Ready.gov flood safety',
  },
  fire: {
    en: ['Leave the burning area immediately and stay outside.', 'Crawl low under smoke and use stairs, not lifts.', 'Call emergency services from a safe location.'],
    ur: ['جلتی ہوئی جگہ سے فوراً باہر نکلیں اور دوبارہ اندر نہ جائیں۔', 'دھوئیں کے نیچے جھک کر چلیں اور لفٹ استعمال نہ کریں۔', 'محفوظ جگہ سے ایمرجنسی سروس کو اطلاع دیں۔'],
    sourceUrl: 'https://www.ready.gov/home-fires', sourceLabel: 'Ready.gov fire safety',
  },
  medical_emergency: {
    en: ['Call local emergency services if the person is in immediate danger.', 'Do not move an injured person unless the location is unsafe.', 'Follow instructions from trained emergency personnel.'],
    ur: ['اگر جان کو فوری خطرہ ہو تو مقامی ایمرجنسی سروس کو کال کریں۔', 'زخمی شخص کو نہ ہلائیں، سوائے اس کے کہ جگہ غیر محفوظ ہو۔', 'تربیت یافتہ امدادی عملے کی ہدایات پر عمل کریں۔'],
    sourceUrl: 'https://www.redcross.org/take-a-class/first-aid/performing-first-aid/first-aid-steps', sourceLabel: 'Red Cross first-aid steps',
  },
  heatwave: {
    en: ['Move to the coolest available place and drink water.', 'Check elderly, ill, disabled, and isolated people.', 'Confusion, fainting, or very hot skin needs urgent medical help.'],
    ur: ['دستیاب ٹھنڈی جگہ پر جائیں اور پانی پئیں۔', 'بزرگ، بیمار، معذور اور اکیلے افراد کی خبر لیں۔', 'الجھن، بے ہوشی یا بہت گرم جلد کی صورت میں فوری طبی مدد لیں۔'],
    sourceUrl: 'https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health', sourceLabel: 'WHO heat and health guidance',
  },
  other: {
    en: ['Move away from immediate danger if it is safe.', 'Do not enter damaged structures or touch exposed wires.', 'Keep your phone available for coordinator follow-up.'],
    ur: ['اگر محفوظ ہو تو فوری خطرے سے دور ہو جائیں۔', 'تباہ شدہ عمارت میں داخل نہ ہوں اور کھلی تاروں کو ہاتھ نہ لگائیں۔', 'رابطے کے لیے اپنا فون دستیاب رکھیں۔'],
    sourceUrl: 'https://www.ready.gov/plan', sourceLabel: 'Ready.gov emergency planning',
  },
};

export function SafetyGuidance({ type }: { type: IncidentType }) {
  const [language, setLanguage] = useState<'en' | 'ur'>('en');
  const guidance = GUIDANCE[type];
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-950"><ShieldAlert size={16} /> Immediate safety guidance</h3>
          <p className="mt-1 text-xs text-amber-900">General guidance only—follow local emergency authorities and do not take an unsafe route.</p>
        </div>
        <div className="flex rounded-lg border border-amber-300 bg-white p-0.5 text-xs">
          <button className={`rounded px-2 py-1 ${language === 'en' ? 'bg-amber-700 text-white' : ''}`} onClick={() => setLanguage('en')}>English</button>
          <button className={`rounded px-2 py-1 ${language === 'ur' ? 'bg-amber-700 text-white' : ''}`} onClick={() => setLanguage('ur')}>اردو</button>
        </div>
      </div>
      <ul className={`mt-3 list-disc space-y-1 pl-5 text-sm text-amber-950 ${language === 'ur' ? 'text-right [direction:rtl]' : ''}`}>
        {guidance[language].map((item) => <li key={item}>{item}</li>)}
      </ul>
      <a href={guidance.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-amber-900 underline">
        Source: {guidance.sourceLabel} <ExternalLink size={11} />
      </a>
    </section>
  );
}
