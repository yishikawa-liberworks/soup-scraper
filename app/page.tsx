// app/page.tsx
'use client';

import { useState } from 'react';

const API = "https://b06go6zl28.execute-api.ap-northeast-1.amazonaws.com"; // 例: https://xxx.execute-api.ap-northeast-1.amazonaws.com

export default function Page() {
  const [owner, setOwner] = useState('vercel');
  const [repo, setRepo]   = useState('next.js');
  const [labels, setLabels] = useState('bug');
  const [wantedN, setWantedN] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadCsv = async () => {
    setBusy(true); setError(null);
    try {
      const qs = new URLSearchParams({
        owner, repo, labels, wantedN: String(wantedN)
      }).toString();
      const res = await fetch(`${API}/issues.csv?${qs}`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${owner}-${repo}-issues.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Issues CSV ダウンロード</h1>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          <span>owner</span>
          <input className="border p-2" value={owner} onChange={e=>setOwner(e.target.value)} />
        </label>
        <label className="flex flex-col">
          <span>repo</span>
          <input className="border p-2" value={repo} onChange={e=>setRepo(e.target.value)} />
        </label>
        <label className="flex flex-col">
          <span>labels (カンマ区切り)</span>
          <input className="border p-2" value={labels} onChange={e=>setLabels(e.target.value)} />
        </label>
        <label className="flex flex-col">
          <span>wantedN</span>
          <input className="border p-2" type="number" min={1} max={1000}
                 value={wantedN} onChange={e=>setWantedN(Number(e.target.value))} />
        </label>
      </div>
      <button onClick={downloadCsv} disabled={busy}
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
        {busy ? 'Downloading…' : 'CSV をダウンロード'}
      </button>
      {error && <p className="text-red-600">Error: {error}</p>}
      <p className="text-sm opacity-70">※ これはクライアント側 fetch（App Router）。CORS は API 側で許可が必要です。 </p>
    </main>
  );
}

// App Router を静的出力専用に（サーバー機能を使っていない保証）
export const dynamic = 'error';
