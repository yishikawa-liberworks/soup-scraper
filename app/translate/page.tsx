// app/translate/page.tsx
'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE!; // Actionsで埋め込み必須

type PresignUpload = { url: string; key: string; bucket: string; expiresIn: number };
type Health = { status: string; bucket: string };

export default function TranslatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [bucket, setBucket] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!file) return;
    if (!API) { setError('API base URL 未設定'); return; }
    setBusy(true);
    setError(null);
    setKey(null);
    try {
      // 1) 署名付きURLを発行
      const presignRes = await fetch(`${API}/presign/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      });
      if (!presignRes.ok) {
        const msg = await safeErr(presignRes);
        throw new Error(`presign failed: ${presignRes.status} ${msg}`);
      }
      const presign = (await presignRes.json()) as PresignUpload;
      if (!presign.url) throw new Error('presign response missing url');

      // 2) 直接 S3 に PUT
      const putRes = await fetch(presign.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) throw new Error(`s3 put failed: ${putRes.status}`);

      setKey(presign.key);
      setBucket(presign.bucket);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const checkHealth = async () => {
    setError(null);
    try {
      const r = await fetch(`${API}/status`);
      if (!r.ok) throw new Error(`status failed: ${r.status}`);
      setHealth(await r.json());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const downloadUploaded = async () => {
    if (!key) return;
    try {
      const r = await fetch(`${API}/presign/download?key=${encodeURIComponent(key)}`);
      if (!r.ok) throw new Error(`presign download failed: ${r.status}`);
      const { url } = await r.json() as { url: string };
      location.href = url; // 一時URLへ遷移
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">CSV アップロード（S3 直PUT）</h1>

      <div className="space-y-2">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={start}
          disabled={!file || busy}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {busy ? 'Uploading…' : 'アップロード'}
        </button>
        <button
          onClick={checkHealth}
          className="ml-2 px-3 py-2 rounded border"
          type="button"
        >
          ヘルスチェック
        </button>
      </div>

      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {bucket && key && (
        <div className="border p-3 rounded space-y-2">
          <p>bucket: <code>{bucket}</code></p>
          <p>key: <code className="break-all">{key}</code></p>
          <button
            onClick={downloadUploaded}
            className="px-3 py-2 rounded bg-green-600 text-white"
          >
            （確認用）アップロードしたCSVをダウンロード
          </button>
        </div>
      )}

      {health && (
        <div className="border p-3 rounded">
          <p>status: <b>{health.status}</b></p>
          <p>bucket: <code>{health.bucket}</code></p>
        </div>
      )}
    </main>
  );
}

async function safeErr(res: Response) {
  try { const j = await res.json(); return j?.error || j?.message || ''; }
  catch { return ''; }
}
