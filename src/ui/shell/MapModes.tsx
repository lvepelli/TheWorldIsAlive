import React, { useEffect, useState } from 'react';
import { useGame, type MapOverlay } from '@/state/store';
import { useT } from '../i18n';

/** Map-mode selector: one emphasized layer at a time. Ids are UI modes; each maps to a renderer overlay. */
export const MAP_MODES: { id: string; overlay: MapOverlay; ico: string }[] = [
  { id: 'political', overlay: 'political', ico: '◧' }, { id: 'regions', overlay: 'regions', ico: '▦' }, { id: 'economy', overlay: 'economy', ico: '◈' }, { id: 'population', overlay: 'population', ico: '👥' },
  { id: 'diplomacy', overlay: 'diplomacy', ico: '🤝' }, { id: 'conflict', overlay: 'tension', ico: '⚔' }, { id: 'religion', overlay: 'religion', ico: '☼' }, { id: 'technology', overlay: 'tech', ico: '⚗' },
  { id: 'stability', overlay: 'stability', ico: '⚖' }, { id: 'resources', overlay: 'harvest', ico: '🌾' }, { id: 'companies', overlay: 'companies', ico: '🏢' }, { id: 'migration', overlay: 'climate', ico: '🧭' },
];

export function MapModes(): React.ReactElement {
  const t = useT(); const overlay = useGame((s) => s.overlay); const setOverlay = useGame((s) => s.setOverlay); const setLinks = useGame((s) => s.setLinks);
  const [open, setOpen] = useState(false); const [hint, setHint] = useState<string | null>(null);
  useEffect(() => { if (!hint) return; const id = setTimeout(() => setHint(null), 3200); return () => clearTimeout(id); }, [hint]);
  const cur = MAP_MODES.find((m) => m.overlay === overlay) ?? MAP_MODES[0];
  return (
    <div className={`mapmodes ${open ? 'open' : ''}`} role="group" aria-label={t('map.mode')}>
      {hint && <div className="overlay-hint" role="status">{hint}</div>}
      <button className="mapmodes-current" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="mapmode" title={t('map.mode')}><span className="ico" aria-hidden>{cur.ico}</span><span>{t(`map.mode.${cur.id}`)}</span><span className="dim">▾</span></button>
      {open && (
        <div className="mapmodes-grid" role="listbox">
          {MAP_MODES.map((m) => <button key={m.id} role="option" aria-selected={overlay === m.overlay} className={overlay === m.overlay ? 'active' : ''} data-mapmode={m.id} title={t(`map.hint.${m.id}`)} onClick={() => { setOverlay(m.overlay); setLinks(m.id === 'diplomacy' ? 'all' : 'auto'); setHint(`${t(`map.mode.${m.id}`)}: ${t(`map.hint.${m.id}`)}`); setOpen(false); }}><span className="ico" aria-hidden>{m.ico}</span>{t(`map.mode.${m.id}`)}</button>)}
        </div>
      )}
    </div>
  );
}
