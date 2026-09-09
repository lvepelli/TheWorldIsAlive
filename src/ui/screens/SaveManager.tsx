import React, { useEffect, useRef } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';

export function SaveManager({ onDone }: { onDone: () => void }): React.ReactElement {
  const t = useT();
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
    <div className="col" style={{ gap: 10 }} data-testid="saves">
      {world && (
        <div className="row wrap">
          <button className="btn primary" data-testid="save-world" onClick={() => { void save(); }}>{t('saves.save')}</button>
          <button className="btn" data-testid="save-autosave" onClick={() => { void save('autosave'); }}>{t('saves.autosave')}</button>
          <button className="btn" onClick={exportSave}>{t('saves.export')}</button>
          <button className="btn" onClick={() => file.current?.click()}>{t('saves.import')}</button>
          <input ref={file} type="file" accept=".json,.twia.json,application/json" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const ok = await importSave(f); if (ok) onDone(); } e.target.value = ''; }} />
        </div>
      )}
      <div className="section-title">{t('saves.list')}</div>
      {!saves.length && <div className="dim">{t('saves.empty')}</div>}
      <div className="save-list">
        {saves.map((s) => (
          <div key={s.slot} className="card row" style={{ gap: 10 }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row"><b className="ellipsis">{s.name}</b><span className="chip">{s.slot === 'autosave' ? t('saves.auto') : t('saves.manual')}</span></div>
              <div className="dim" style={{ fontSize: 12 }}>{t('saves.meta', { date: s.date, countries: s.countries, events: s.events })} <span className="mono">{s.seed}</span></div>
            </div>
            <button className="btn sm" onClick={async () => { if (await load(s.slot)) onDone(); }}>{t('saves.load')}</button>
            <button className="btn sm ghost danger" onClick={() => { if (confirm(t('saves.deleteConfirm'))) void del(s.slot); }} aria-label={t('saves.delete')}>✕</button>
          </div>
        ))}
      </div>
      {world && <><div className="divider" /><button className="btn ghost" onClick={() => { onDone(); toIntro(); }}>{t('saves.backToTitle')}</button></>}
    </div>
  );
}
