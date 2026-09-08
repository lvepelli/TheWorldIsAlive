import React, { useEffect, useRef } from 'react';
import { useGame } from '@/state/store';

export function SaveManager({ onDone }: { onDone: () => void }): React.ReactElement {
  const saves = useGame((s) => s.saves);
  const refresh = useGame((s) => s.refreshSaves);
  const save = useGame((s) => s.saveWorld);
  const load = useGame((s) => s.loadWorld);
  const del = useGame((s) => s.deleteSave);
  const exportSave = useGame((s) => s.exportSave);
  const importSave = useGame((s) => s.importSave);
  const toIntro = useGame((s) => s.toIntro);
  const world = useGame((s) => s.world);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { void refresh(); }, [refresh]);
  return (
    <div className="col" style={{ gap: 10 }}>
      {world && (
        <div className="row wrap">
          <button className="btn primary" onClick={() => { void save(); }}>Save world</button>
          <button className="btn" onClick={() => { void save('autosave'); }}>Overwrite autosave</button>
          <button className="btn" onClick={exportSave}>Export file</button>
          <button className="btn" onClick={() => file.current?.click()}>Import file</button>
          <input ref={file} type="file" accept=".json,.twia.json,application/json" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const ok = await importSave(f); if (ok) onDone(); } e.target.value = ''; }} />
        </div>
      )}
      <div className="section-title">Saved worlds</div>
      {!saves.length && <div className="dim">No saves yet.</div>}
      <div className="save-list">
        {saves.map((s) => (
          <div key={s.slot} className="card row" style={{ gap: 10 }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row"><b className="ellipsis">{s.name}</b><span className="chip">{s.slot === 'autosave' ? 'autosave' : 'manual'}</span></div>
              <div className="dim" style={{ fontSize: 12 }}>{s.date} · {s.countries} nations · {s.events} events · seed <span className="mono">{s.seed}</span></div>
            </div>
            <button className="btn sm" onClick={async () => { if (await load(s.slot)) onDone(); }}>Load</button>
            <button className="btn sm ghost danger" onClick={() => { if (confirm('Delete this save?')) void del(s.slot); }} aria-label="Delete save">✕</button>
          </div>
        ))}
      </div>
      {world && <><div className="divider" /><button className="btn ghost" onClick={() => { onDone(); toIntro(); }}>← Back to title / new world</button></>}
    </div>
  );
}
