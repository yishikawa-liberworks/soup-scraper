// app/translate/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
const API = "https://b06go6zl28.execute-api.ap-northeast-1.amazonaws.com";

type PresignResp = {
  url: string; key: string; bucket: string; expiresIn: number;
  jobId: string; statusKey: string; outKey: string;
};
type StatusResp = { jobId: string; state: 'STARTED'|'RUNNING'|'COMPLETED'|'FAILED'; percent?: number; outKey?: string; error?: string };

export default function TranslatePage() {
  const [file, setFile] = useState<File|null>(null);
  const [info, setInfo] = useState<PresignResp|null>(null);
  const [status, setStatus] = useState<StatusResp|null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>|null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const start = async () => {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      // 1) 署名URL
      const r1 = await fetch(`${API}/presign/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'text/csv' }),
      });
      if (!r1.ok) throw new Error('presign failed');
      const presign = await r1.json() as PresignResp;
      setInfo(presign);

      // 2) S3 直PUT
      const r2 = await fetch(presign.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'text/csv' },
        body: file,
      });
      if (!r2.ok) throw new Error('s3 put failed');

      // 3) ポーリング
      poll(presign.jobId);
    } catch (e) {
      alert(String((e as any)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const poll = (jobId: string) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const r = await fetch(`${API}/status?jobId=${encodeURIComponent(jobId)}`);
      if (r.ok) {
        const s = await r.json() as StatusResp;
        setStatus(s);
        if (s.state === 'COMPLETED' || s.state === 'FAILED') {
          if (timer.current) clearInterval(timer.current);
        }
      }
    }, 1500);
  };

  const downloadOut = async () => {
    const outKey = status?.outKey ?? info?.outKey;
    if (!outKey) return;
    const r = await fetch(`${API}/presign/download?key=${encodeURIComponent(outKey)}`);
    if (!r.ok) return;
    const { url } = await r.json() as { url: string };
    location.href = url;
  };

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">翻訳CSV（S3 経由）</h1>
      <input type="file" accept=".csv" onChange={e=>setFile(e.target.files?.[0] ?? null)} />
      <button onClick={start} disabled={!file || busy}
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
        {busy ? 'Uploading…' : 'アップロードして翻訳開始'}
      </button>

      {info && <p className="text-sm">jobId: <code>{info.jobId}</code></p>}

      {status && (
        <div className="border p-3 rounded space-y-2">
          <p>state: <b>{status.state}</b>{status.percent != null ? ` (${status.percent}%)` : ''}</p>
          {status.error && <p className="text-red-600">error: {status.error}</p>}
          {status.state === 'COMPLETED' && (
            <button onClick={downloadOut} className="px-3 py-2 rounded bg-green-600 text-white">
              出力CSVをダウンロード
            </button>
          )}
        </div>
      )}
    </main>
  );
}
