import { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'en' | 'ur';

// Public screens only. Coordinator and responder screens stay in English.
const en = {
  'brand.place': 'Islamabad disaster response',
  'nav.report': 'Report emergency',
  'nav.track': 'Track a report',
  'nav.signin': 'Staff sign in',
  'nav.workspace': 'My workspace',
  'nav.home': 'Home',
  'lang.other': 'اردو',
  'call.banner': 'Life in immediate danger? Call 1122 (Rescue) first.',

  'home.title': 'Is someone in danger right now?',
  'home.lead': 'Tell us what is happening and where. Speak in Urdu or English, or report for a neighbour or relative who cannot.',
  'home.report': 'Report an emergency',
  'home.reportHint': 'About a minute. No account needed.',
  'home.track': 'Track a report you sent',
  'home.trackHint': 'Use your report ID and tracking key.',
  'home.register': 'Register someone who may need help',
  'home.registerHint': 'For older, disabled or ill people who cannot leave on their own. We check on them when a warning is issued.',
  'home.after': 'What happens after you report',
  'home.step1': 'A coordinator sees your report at once. The most urgent reports are at the top, and every priority comes with its reasons.',
  'home.step2': 'The nearest team with the right equipment is sent. A boat for a flood, not just the closest van.',
  'home.step3': 'You can follow progress and see nearby shelters with space.',
  'home.unseenTitle': 'We also look for people who cannot report',
  'home.unseenBody': 'When a warning covers an area with many older residents or weak signal and no reports come in, coordinators send a team to check in person.',
  'home.warning': 'Weather warning for Islamabad',
  'home.noWarning': 'No severe weather expected in the next 24 hours.',
  'home.source': 'Source: Open-Meteo forecast',
  'home.footer': 'ResQNet supports, and never replaces, official emergency services.',
  'home.forecastDown': 'The forecast is unavailable right now.',

  'report.title': 'Report an emergency',
  'report.lead': 'Three things are needed: what is happening, a few words about it, and where. Everything else is optional.',
  'report.what': 'What is happening?',
  'type.flood': 'Flood',
  'type.fire': 'Fire',
  'type.medical_emergency': 'Medical',
  'type.heatwave': 'Heat',
  'type.other': 'Accident or other',
  'report.describe': 'Describe it',
  'report.describeHint': 'Record your voice or type. Urdu, English or both are fine.',
  'report.placeholder': 'For example: water is rising fast, my grandmother cannot walk, children are upstairs.',
  'report.where': 'Where is it?',
  'report.whereHint': 'We try to find you automatically. Tap the map or drag the pin to correct it.',
  'report.who': 'Who needs help?',
  'report.me': 'Me or people with me',
  'report.someoneElse': 'Someone else',
  'report.relationship': 'How do you know them? (optional)',
  'report.relationshipPlaceholder': 'Neighbour, relative, colleague…',
  'report.needs': 'Do any of these apply?',
  'report.needsHint': 'This moves people who cannot get out alone up the list.',
  'report.photo': 'Add a photo',
  'report.photoHint': 'Optional. Compressed on your phone and seen only by response staff.',
  'report.photoPick': 'Choose or take a photo',
  'report.more': 'More details',
  'report.moreHint': 'Optional. Skip this if you are in danger.',
  'report.people': 'How many people are affected?',
  'report.trapped': 'Is anyone trapped?',
  'report.injured': 'Is anyone injured or in need of medical help?',
  'report.vulnerable': 'Are children, older or disabled people at risk?',
  'report.worse': 'Is it getting worse?',
  'tri.yes': 'Yes',
  'tri.no': 'No',
  'tri.unknown': 'Not sure',
  'report.unsureNote': '"Not sure" is fine. It is treated as unknown, never as no.',
  'report.contact': 'Your contact details',
  'report.contactHint': 'Optional. Only coordinators can see them.',
  'report.name': 'Your name',
  'report.phone': 'Phone number',
  'report.landmark': 'Nearby landmark',
  'report.send': 'Send report',
  'report.sending': 'Sending…',
  'report.attaching': 'Attaching audio…',
  'report.done': 'Report received',
  'report.doneBody': 'Coordinators can see it now. Keep the two codes below: you need both to check on your report.',
  'report.id': 'Report ID',
  'report.key': 'Private tracking key',
  'report.copy': 'Copy',
  'report.trackIt': 'Track this report',
  'report.backHome': 'Back to home',

  'need.elderly': 'Older person',
  'need.child': 'Child',
  'need.disabled': 'Disabled',
  'need.pregnant': 'Pregnant',
  'need.cannot_walk': 'Cannot walk',
  'need.wheelchair': 'Wheelchair user',
  'need.bedbound': 'Bedridden',
  'need.chronic_condition': 'Long-term illness',
  'need.needs_medicine': 'Needs medicine',
  'need.oxygen_dependency': 'Uses oxygen',
  'need.dialysis': 'Needs dialysis',
  'need.lives_alone': 'Lives alone',
  'need.no_phone': 'No phone',
  'need.power_dependency': 'Needs electricity',
  'need.limited_transport': 'No transport',
};

type Key = keyof typeof en;

const ur: Record<Key, string> = {
  'brand.place': 'اسلام آباد ہنگامی امداد',
  'nav.report': 'ہنگامی اطلاع دیں',
  'nav.track': 'رپورٹ دیکھیں',
  'nav.signin': 'عملے کا لاگ اِن',
  'nav.workspace': 'میرا ورک اسپیس',
  'nav.home': 'ہوم',
  'lang.other': 'English',
  'call.banner': 'جان کو فوری خطرہ ہو تو پہلے 1122 (ریسکیو) پر کال کریں۔',

  'home.title': 'کیا اس وقت کوئی خطرے میں ہے؟',
  'home.lead': 'ہمیں بتائیں کیا ہو رہا ہے اور کہاں۔ اردو یا انگریزی میں بولیں، یا کسی ایسے پڑوسی یا رشتہ دار کی طرف سے اطلاع دیں جو خود نہیں دے سکتا۔',
  'home.report': 'ہنگامی اطلاع دیں',
  'home.reportHint': 'تقریباً ایک منٹ۔ اکاؤنٹ کی ضرورت نہیں۔',
  'home.track': 'اپنی بھیجی ہوئی رپورٹ دیکھیں',
  'home.trackHint': 'اپنی رپورٹ آئی ڈی اور ٹریکنگ کی استعمال کریں۔',
  'home.register': 'ایسے شخص کا اندراج کریں جسے مدد کی ضرورت پڑ سکتی ہے',
  'home.registerHint': 'بزرگ، معذور یا بیمار افراد کے لیے جو خود نہیں نکل سکتے۔ وارننگ جاری ہونے پر ہم ان کی خیریت معلوم کرتے ہیں۔',
  'home.after': 'اطلاع کے بعد کیا ہوتا ہے',
  'home.step1': 'کوآرڈینیٹر فوراً آپ کی رپورٹ دیکھتا ہے۔ سب سے فوری رپورٹیں اوپر ہوتی ہیں، اور ہر ترجیح کی وجہ بتائی جاتی ہے۔',
  'home.step2': 'درست سامان والی قریب ترین ٹیم بھیجی جاتی ہے۔ سیلاب کے لیے کشتی، صرف قریبی گاڑی نہیں۔',
  'home.step3': 'آپ پیش رفت دیکھ سکتے ہیں اور قریبی پناہ گاہیں جہاں جگہ ہو۔',
  'home.unseenTitle': 'ہم ان لوگوں کو بھی تلاش کرتے ہیں جو اطلاع نہیں دے سکتے',
  'home.unseenBody': 'جب کسی ایسے علاقے پر وارننگ ہو جہاں زیادہ بزرگ رہتے ہوں یا سگنل کمزور ہو اور کوئی اطلاع نہ آئے، تو کوآرڈینیٹر خود جا کر دیکھنے کے لیے ٹیم بھیجتے ہیں۔',
  'home.warning': 'اسلام آباد کے لیے موسمی وارننگ',
  'home.noWarning': 'اگلے 24 گھنٹوں میں شدید موسم کی توقع نہیں۔',
  'home.source': 'ذریعہ: Open-Meteo پیش گوئی',
  'home.footer': 'ResQNet سرکاری ہنگامی خدمات کی مدد کرتا ہے، ان کی جگہ نہیں لیتا۔',
  'home.forecastDown': 'پیش گوئی اس وقت دستیاب نہیں۔',

  'report.title': 'ہنگامی اطلاع دیں',
  'report.lead': 'تین چیزیں ضروری ہیں: کیا ہو رہا ہے، اس کے بارے میں چند الفاظ، اور کہاں۔ باقی سب اختیاری ہے۔',
  'report.what': 'کیا ہو رہا ہے؟',
  'type.flood': 'سیلاب',
  'type.fire': 'آگ',
  'type.medical_emergency': 'طبی',
  'type.heatwave': 'شدید گرمی',
  'type.other': 'حادثہ یا دیگر',
  'report.describe': 'تفصیل بتائیں',
  'report.describeHint': 'آواز ریکارڈ کریں یا لکھیں۔ اردو، انگریزی یا دونوں ٹھیک ہیں۔',
  'report.placeholder': 'مثلاً: پانی تیزی سے بڑھ رہا ہے، دادی چل نہیں سکتیں، بچے اوپر ہیں۔',
  'report.where': 'یہ کہاں ہے؟',
  'report.whereHint': 'ہم خود آپ کا مقام تلاش کرنے کی کوشش کرتے ہیں۔ درست کرنے کے لیے نقشے پر ٹیپ کریں یا پن کھینچیں۔',
  'report.who': 'کسے مدد چاہیے؟',
  'report.me': 'مجھے یا میرے ساتھ والوں کو',
  'report.someoneElse': 'کسی اور کو',
  'report.relationship': 'آپ انہیں کیسے جانتے ہیں؟ (اختیاری)',
  'report.relationshipPlaceholder': 'پڑوسی، رشتہ دار، ساتھی…',
  'report.needs': 'کیا ان میں سے کچھ لاگو ہوتا ہے؟',
  'report.needsHint': 'اس سے ان لوگوں کو ترجیح ملتی ہے جو خود باہر نہیں نکل سکتے۔',
  'report.photo': 'تصویر شامل کریں',
  'report.photoHint': 'اختیاری۔ آپ کے فون پر چھوٹی کی جاتی ہے اور صرف امدادی عملہ دیکھ سکتا ہے۔',
  'report.photoPick': 'تصویر منتخب کریں یا کھینچیں',
  'report.more': 'مزید تفصیلات',
  'report.moreHint': 'اختیاری۔ اگر آپ خطرے میں ہیں تو اسے چھوڑ دیں۔',
  'report.people': 'کتنے لوگ متاثر ہیں؟',
  'report.trapped': 'کیا کوئی پھنسا ہوا ہے؟',
  'report.injured': 'کیا کوئی زخمی ہے یا اسے طبی مدد چاہیے؟',
  'report.vulnerable': 'کیا بچے، بزرگ یا معذور افراد خطرے میں ہیں؟',
  'report.worse': 'کیا صورتحال بگڑ رہی ہے؟',
  'tri.yes': 'ہاں',
  'tri.no': 'نہیں',
  'tri.unknown': 'معلوم نہیں',
  'report.unsureNote': '"معلوم نہیں" ٹھیک ہے۔ اسے نامعلوم سمجھا جاتا ہے، کبھی "نہیں" نہیں۔',
  'report.contact': 'آپ کا رابطہ',
  'report.contactHint': 'اختیاری۔ صرف کوآرڈینیٹر دیکھ سکتے ہیں۔',
  'report.name': 'آپ کا نام',
  'report.phone': 'فون نمبر',
  'report.landmark': 'قریبی نشانی',
  'report.send': 'رپورٹ بھیجیں',
  'report.sending': 'بھیجی جا رہی ہے…',
  'report.attaching': 'آواز منسلک ہو رہی ہے…',
  'report.done': 'رپورٹ موصول ہو گئی',
  'report.doneBody': 'کوآرڈینیٹر اسے اب دیکھ سکتے ہیں۔ نیچے دیے گئے دونوں کوڈ محفوظ رکھیں: رپورٹ دیکھنے کے لیے دونوں ضروری ہیں۔',
  'report.id': 'رپورٹ آئی ڈی',
  'report.key': 'نجی ٹریکنگ کی',
  'report.copy': 'کاپی',
  'report.trackIt': 'یہ رپورٹ دیکھیں',
  'report.backHome': 'ہوم پر واپس',

  'need.elderly': 'بزرگ',
  'need.child': 'بچہ',
  'need.disabled': 'معذور',
  'need.pregnant': 'حاملہ',
  'need.cannot_walk': 'چل نہیں سکتے',
  'need.wheelchair': 'وہیل چیئر',
  'need.bedbound': 'بستر پر',
  'need.chronic_condition': 'طویل بیماری',
  'need.needs_medicine': 'دوا درکار',
  'need.oxygen_dependency': 'آکسیجن استعمال',
  'need.dialysis': 'ڈائیلاسز درکار',
  'need.lives_alone': 'اکیلے رہتے ہیں',
  'need.no_phone': 'فون نہیں',
  'need.power_dependency': 'بجلی درکار',
  'need.limited_transport': 'سواری نہیں',
};

const dictionaries: Record<Lang, Record<Key, string>> = { en, ur };

type LangContext = { lang: Lang; setLang: (lang: Lang) => void; t: (key: Key) => string };
const Ctx = createContext<LangContext | null>(null);

function initialLang(): Lang {
  try { return localStorage.getItem('resqnet_lang') === 'ur' ? 'ur' : 'en'; } catch { return 'en'; }
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
  }, [lang]);
  const setLang = (next: Lang) => {
    setLangState(next);
    try { localStorage.setItem('resqnet_lang', next); } catch { /* private mode: keep in memory only */ }
  };
  return <Ctx.Provider value={{ lang, setLang, t: (key) => dictionaries[lang][key] }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}

// Coordinator screens are English-only and always left-to-right, whatever the public language choice.
export function useForceLtr() {
  useEffect(() => {
    const html = document.documentElement;
    const previous = { lang: html.lang, dir: html.dir };
    html.lang = 'en';
    html.dir = 'ltr';
    return () => { html.lang = previous.lang; html.dir = previous.dir; };
  }, []);
}
