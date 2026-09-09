import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { daysAgo } from '@/engine/time';
import { Avatar } from '../components/Avatar';
import { fmtNum } from '../format';
import { useT } from '../i18n';
import type { SocialPost } from '@/engine/types';

export function SocialScreen(): React.ReactElement {
  const t = useT();
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const [tag, setTag] = useState<string | null>(null);
  const [mode, setMode] = useState<'latest' | 'viral'>('latest');
  const [limit, setLimit] = useState(60);
  const posts = useMemo(() => {
    let p = world.social.filter((x) => !x.replyTo);
    if (tag) p = p.filter((x) => x.hashtags.includes(tag));
    if (mode === 'viral') p = p.filter((x) => x.viral || x.likes > 5000).sort((a, b) => b.likes - a.likes);
    else p = p.slice().reverse();
    return p.slice(0, limit);
  }, [world, version, tag, mode, limit]);
  const replies = useMemo(() => { const m = new Map<string, SocialPost[]>(); for (const r of world.social) if (r.replyTo) { const a = m.get(r.replyTo) ?? []; a.push(r); m.set(r.replyTo, a); } return m; }, [world, version]);
  const mood = useMemo(() => { const recent = world.social.slice(-200); return recent.length ? recent.reduce((s, p) => s + p.sentiment, 0) / recent.length : 0; }, [world, version]);
  return (
    <div className="screen" data-testid="social-screen">
      <div className="screen-inner">
        <div className="screen-header">
          <div><div className="kicker">{t('social.kicker')}</div><h2 className="screen-title">{t('social.title')}</h2></div>
          <div className="dim mono">{t('social.mood')} {mood >= 0 ? '+' : ''}{(mood * 100).toFixed(0)} · {world.social.length} {t('social.posts')}</div>
        </div>
        <div className="panel-solid" style={{ padding: 12 }}>
          <div className="section-title">{t('social.trendingNow')} {tag && <button className="btn ghost sm" onClick={() => setTag(null)}>{t('social.clear')}</button>}</div>
          <div className="chips">
            {world.trending.map((tr) => <button key={tr.tag} className={`chip clickable ${tag === tr.tag ? 'active' : ''}`} onClick={() => setTag(tag === tr.tag ? null : tr.tag)}>#{tr.tag} <span className="dim">{fmtNum(tr.count * 900)}</span></button>)}
            {!world.trending.length && <span className="dim">{t('social.nothingTrending')}</span>}
          </div>
        </div>
        <div className="row">
          <button className={`chip clickable ${mode === 'latest' ? 'active' : ''}`} onClick={() => setMode('latest')}>{t('social.latest')}</button>
          <button className={`chip clickable ${mode === 'viral' ? 'active' : ''}`} onClick={() => setMode('viral')}>{t('social.viral')}</button>
        </div>
        <div className="panel-solid" style={{ overflow: 'hidden' }}>
          {posts.map((p) => <Post key={p.id} post={p} replies={replies.get(p.id) ?? []} onTag={(h) => setTag(h)} />)}
          {!posts.length && <div className="dim" style={{ padding: 16 }}>{t('social.silence')}</div>}
        </div>
        {posts.length >= limit && <button className="btn" onClick={() => setLimit(limit + 60)}>{t('social.morePosts')}</button>}
      </div>
    </div>
  );
}

export function Post({ post, replies, onTag }: { post: SocialPost; replies?: SocialPost[]; onTag?: (t: string) => void }): React.ReactElement {
  const t = useT();
  const world = useGame((s) => s.world)!;
  const select = useGame((s) => s.select);
  const a = world.people[post.authorId];
  const [open, setOpen] = useState(false);
  if (!a) return <></>;
  return (
    <>
      <div className={`post ${post.viral ? 'viral' : ''} ${post.replyTo ? 'reply' : ''}`}>
        <span onClick={() => select({ kind: 'person', id: a.id })} className="clickable"><Avatar name={a.name} id={a.id} alive={a.alive} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="who"><b className="clickable" onClick={() => select({ kind: 'person', id: a.id })}>{a.name}</b><span className="handle">@{a.socialHandle}</span>{a.fame > 60 && <span title={t('social.verified')} style={{ color: 'var(--data)' }}>✓</span>}<span className="dim">· {daysAgo(post.day, world.day)}</span>{post.viral && <span className="viral-tag">VIRAL</span>}</div>
          <div className="text">{post.text} {post.hashtags.map((h) => <span key={h} className="ht clickable" onClick={() => onTag?.(h)}>#{h} </span>)}</div>
          <div className="actions"><span>♡ {fmtNum(post.likes, 1)}</span><span>⇄ {fmtNum(post.reposts, 1)}</span><span className={replies?.length ? 'clickable' : ''} onClick={() => setOpen(!open)}>💬 {post.replies || replies?.length || 0}</span>{post.eventId && <span className="clickable" onClick={() => select({ kind: 'event', id: post.eventId! })}>↗ {t('social.event')}</span>}</div>
        </div>
      </div>
      {open && replies?.map((r) => <Post key={r.id} post={r} />)}
    </>
  );
}
