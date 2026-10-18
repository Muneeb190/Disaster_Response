import { useRef, useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { uploadIncidentPhoto } from '@/lib/evidence';
import { LoadingSpinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';

export function EvidenceUploader({ reportCode, trackingToken }: { reportCode: string; trackingToken: string }) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadIncidentPhoto(file, reportCode, trackingToken);
      setFile(null);
      setUploaded(true);
      if (input.current) input.current.value = '';
      toast('Photo sent privately to authorized response staff', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not upload photo', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-surface p-4 text-left">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800"><Camera size={16} /> Add private photo evidence</h3>
      <p className="mt-1 text-xs text-neutral-500">Optional. Photos are compressed, stored privately, and visible only to assigned responders and coordinators. Maximum three photos per report.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="input text-xs"
          onChange={(event) => { setFile(event.target.files?.[0] ?? null); setUploaded(false); }}
        />
        <button className="btn-primary btn-sm whitespace-nowrap" disabled={!file || uploading} onClick={() => void upload()}>
          {uploading ? <LoadingSpinner size={14} /> : <Upload size={14} />} Upload photo
        </button>
      </div>
      {uploaded && <p className="mt-2 text-xs text-green-700">Photo received and waiting for coordinator review.</p>}
    </section>
  );
}
