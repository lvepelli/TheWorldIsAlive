import React, { useState } from 'react';
import { useGame } from '@/state/store';
import { Modal } from '../components/Modal';
import { SaveManager } from '../screens/SaveManager';
import { InstallButton } from '../components/InstallButton';
import { LANGS } from '@/i18n';
import { useT } from '../i18n';

export function SettingsModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const t = useT(); const settings = useGame((s) => s.settings); const set = useGame((s) => s.setSetting);
  const [saves, setSaves] = useState(false); const [copied, setCopied] = useState(false);
  if (saves) return <Modal title={t('settings.saves')} onClose={onClose}><SaveManager onDone={onClose} /></Modal>;
  const toggles: { k: 'audio' | 'cinematics' | 'largeText' | 'highContrast' | 'debug'; l: string }[] = [{ k: 'audio', l: 'settings.audio' }, { k: 'cinematics', l: 'settings.cinematics' }, { k: 'largeText', l: 'settings.largeText' }, { k: 'highContrast', l: 'settings.highContrast' }, { k: 'debug', l: 'settings.debug' }];
  return (
    <Modal title={t('settings.title')} onClose={onClose}>
      <div className="section-title">{t('settings.language')}</div>
      <div className="row wrap" role="radiogroup" aria-label={t('settings.language')}>
        {LANGS.map((l) => <button key={l.id} className={`chip clickable ${settings.lang === l.id ? 'active' : ''}`} role="radio" aria-checked={settings.lang === l.id} data-testid={`lang-${l.id}`} onClick={() => set('lang', l.id)}>{l.label}</button>)}
      </div>
      <div className="divider" />
      <div className="row wrap">{toggles.map((x) => <label key={x.k} className="chip clickable"><input type="checkbox" checked={settings[x.k]} onChange={(e) => set(x.k, e.target.checked)} /> {t(x.l)}</label>)}</div>
      <div className="divider" />
      <div className="row wrap">
        <button className="btn" data-testid="open-saves" onClick={() => setSaves(true)}>💾 {t('settings.saves')}</button>
        <button className="btn" onClick={() => { const w = useGame.getState().world; if (!w) return; const url = `${location.origin}${location.pathname}?seed=${encodeURIComponent(w.meta.seed)}`; navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => prompt('URL', url)); }}>🔗 {copied ? t('settings.copied') : t('settings.share')}</button>
        <InstallButton />
        <button className="btn" onClick={() => { if (confirm(t('settings.resetConfirm'))) { onClose(); useGame.getState().toIntro(); } }}>✦ {t('settings.newWorld')}</button>
      </div>
    </Modal>
  );
}
