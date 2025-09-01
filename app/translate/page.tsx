// app/translate/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
const API = process.env.NEXT_PUBLIC_API_BASE!;

type PresignResp = { uploadUrl: string; key: string; jobId: string; statusKey: string };
type StatusResp = { jobId: string; state: string; percent?: number; outKey?: string; error?: string };

export default function TranslatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<PresignResp | null>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const start = async () => {
    if (!file) return;
    setBusy(true);
    try {
      // 1) 署名付きURLを発行
      const presign = await fetch(`${API}/presign/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'text/csv' }),
      }).then(r => r.json()) as PresignResp;

      setJob(presign);

      // 2) 直接 S3 PUT （CORS は S3 バケットで許可済み想定）
      await fetch(presign.uploadUrl, { method: 'PUT', body: file });

      // 3) 進行状況ポーリング（status/{jobId}.json を Lambda が更新していく）
      poll(presign.jobId);
    } finally {
      setBusy(false);
    }
  };

  const poll = async (jobId: string) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const s = await fetch(`${API}/status?jobId=${encodeURIComponent(jobId)}`).then(r => r.json()) as StatusResp;
      setStatus(s);
      if ((s.state === 'COMPLETED' || s.state === 'FAILED') && timer.current) clearInterval(timer.current);
    }, 2000);
  };

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const downloadOut = async () => {
    if (!status?.outKey) return;
    const url = `${API}/presign/download?key=${encodeURIComponent(status.outKey)}`;
    const res = await fetch(url);
    const { url: signed } = await res.json(); // presign.ts 側が { url } を返す想定
    location.href = signed;
  };

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">翻訳CSV（S3 経由）</h1>
      <input type="file" accept=".csv" onChange={e=>setFile(e.target.files?.[0] ?? null)} />
      <button onClick={start} disabled={!file || busy}
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
        {busy ? 'Uploading…' : 'アップロードして翻訳開始'}
      </button>

      {job && <p className="text-sm">jobId: <code>{job.jobId}</code></p>}
      {status && (
        <div className="border p-3 rounded">
          <p>state: <b>{status.state}</b>{status.percent != null ? ` (${status.percent}%)` : ''}</p>
          {status.error && <p className="text-red-600">error: {status.error}</p>}
          {status.state === 'COMPLETED' && (
            <button onClick={downloadOut} className="mt-2 px-3 py-2 rounded bg-green-600 text-white">
              出力CSVをダウンロード
            </button>
          )}
        </div>
      )}
    </main>
  );
}

export const dynamic = 'error';
