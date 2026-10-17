import { cn } from '@/lib/utils';
import { hasUrdu } from '@/lib/voiceRecorder';
import type { TranscriptLanguage } from '@/types';

// Urdu is shown right-to-left in a Nastaliq font. Mixed English/Urdu uses the browser's
// per-paragraph direction (dir="auto") with the same font stack, so each script renders properly.
export function TranscriptText({ text, language, className }: { text: string; language?: TranscriptLanguage | null; className?: string }) {
  const containsUrdu = hasUrdu(text);
  const urdu = language === 'ur' || (!language && containsUrdu && !/[A-Za-z]/.test(text));
  return (
    <p
      dir={urdu ? 'rtl' : 'auto'}
      lang={urdu ? 'ur' : language === 'en' ? 'en' : undefined}
      className={cn('whitespace-pre-wrap', containsUrdu ? 'urdu-text' : 'leading-relaxed', urdu && 'text-right', className)}
    >
      {text}
    </p>
  );
}
