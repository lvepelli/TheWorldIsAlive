import React, { useMemo, useState } from 'react';
import { useGame, type Speed } from '@/state/store';
import { useT } from '../i18n';
import { formatDate } from '@/engine/time';
import { pctChange } from '@/engine/simulation/markets';
import { SearchBox } from './SearchBox';
import { Modal } from '../components/Modal';

/** Grand-strategy top bar: date + time controls on the left, global indicators in the middle, search / alerts / menu on the right. */
export function TopBar({ onMenu }: { onMenu: () => void }): React.ReactElement {
  const t = useT();
  const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const speed = useGame((s) => s.speed); const setSpeed = useGame((s) => s.setSpeed); const advance = useGame((s) => s.advance);
  const alerts = useGame((s) => s.alerts); const screen = useGame((s) => s.screen); const setScreen = useGame((s) => s.setScreen);
  const [adv, setAdv] = useState(false);
  const stats = useMemo(() => {
    const cs = Object.values(world.countries); const wars = cs.filter((c) => c.atWarWith.length).length;
    const stab = cs.reduce((s, c) => s + c.stability, 0) / Math.max(1, cs.length);
    const g = world.indexes.global; const ch = g ? pctChange(g.history, Math.min(g.history.length - 1, 30)) : 0;
    const critical = alerts.filter((a) => !a.read && a.severity >= 4).length;
    return { wars, stab, ch, unread: alerts.filter((a) => !a.read).length, critical, nations: cs.length };
  }, [world, version, alerts]);
  const speeds: { s: Speed; k: string }[] = [{ s: 0, k: 'speed.paused' }, { s: 1, k: 'speed.1' }, { s: 5, k: 'speed.5' }, { s: 20, k: 'speed.20' }, { s: 100, k: 'speed.100' }];
  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        <button className="brand-mark" title={t('app.title')} onClick={() => setScreen('world')} aria-label={t('app.title')}>TWIA</button>
        <div className="clock" role="group" aria-label={t('topbar.speed')}>
          <div className="date" title={t('topbar.date')} data-testid="date">{formatDate(world.day, world.meta.startYear, 'short')}</div>
          <div className="speeds">
            {speeds.map(({ s, k }) => <button key={s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)} aria-pressed={speed === s} title={t(k)} data-testid={`speed-${s}`}>{s === 0 ? '❚❚' : s === 100 ? '≫' : `${s}×`}</button>)}
            <button onClick={() => setAdv(true)} title={t('topbar.advance')} aria-label={t('topbar.advance')} data-testid="advance">▸▸</button>
          </div>
        </div>
      </div>
      <div className="topbar-mid hide-mobile" aria-label={t('topbar.economy')}>
        <Indicator ico="◈" label={t('topbar.economy')} value={`${stats.ch >= 0 ? '+' : ''}${stats.ch.toFixed(1)} %`} tone={stats.ch >= 0 ? 'ok' : 'bad'} sub={t('stat.trend30')} />
        <Indicator ico="⚖" label={t('topbar.stability')} value={stats.stab.toFixed(0)} tone={stats.stab > 55 ? 'ok' : stats.stab > 40 ? 'warn' : 'bad'} sub={`${stats.nations} ${t('topbar.nations')}`} />
        <Indicator ico="⚔" label={t('topbar.wars')} value={String(stats.wars)} tone={stats.wars === 0 ? 'ok' : stats.wars < 4 ? 'warn' : 'bad'} sub={`${world.events.length} ${t('topbar.events')}`} />
      </div>
      <div className="topbar-right">
        <SearchBox />
        <button className={`icon-btn ${stats.critical ? 'alert' : ''} ${screen === 'alerts' ? 'active' : ''}`} onClick={() => setScreen(screen === 'alerts' ? 'world' : 'alerts')} title={t('topbar.alerts')} aria-label={t('topbar.alerts')} data-testid="alerts">
          🔔{stats.unread > 0 && <span className="badge">{stats.unread > 99 ? '99+' : stats.unread}</span>}
        </button>
        <button className="icon-btn" onClick={onMenu} title={t('topbar.menu')} aria-label={t('topbar.menu')} data-testid="menu">☰</button>
      </div>
      {adv && (
        <Modal title={t('topbar.advance')} onClose={() => setAdv(false)}>
          <div className="row wrap">
            {[[7, 'topbar.advance.week'], [30, 'topbar.advance.month'], [365, 'topbar.advance.year']].map(([d, k]) => <button key={String(d)} className="btn" data-testid={`advance-${d}`} onClick={() => { setAdv(false); advance(Number(d)); }}>{t(String(k))}</button>)}
          </div>
        </Modal>
      )}
    </header>
  );
}

function Indicator({ ico, label, value, tone, sub }: { ico: string; label: string; value: string; tone: 'ok' | 'warn' | 'bad'; sub?: string }): React.ReactElement {
  return <div className={`indicator ${tone}`} title={label} role="status"><span className="ico" aria-hidden>{ico}</span><span className="val">{value}</span>{sub && <span className="sub">{sub}</span>}</div>;
}
