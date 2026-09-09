/**
 * Information layer: news coverage, social media reactions and trending topics.
 * Everything here reads the events created today and produces derived content.
 */
import { RNG, clamp } from '../rng';
import type { World, WorldEvent, NewsArticle, SocialPost, MediaOutlet, Person } from '../types';
import { nextId } from '../ids';
import { localNarrative, type NarrativeProvider } from '../ai/narrative';

export const MAX_NEWS = 600;
export const MAX_SOCIAL = 900;

let provider: NarrativeProvider = localNarrative;
export function setNarrativeProvider(p: NarrativeProvider): void { provider = p; }
export function getNarrativeProvider(): NarrativeProvider { return provider; }

export function generateNews(world: World, rng: RNG, todays: WorldEvent[]): NewsArticle[] {
  const out: NewsArticle[] = [];
  const outlets = Object.values(world.outlets);
  const journalists = Object.values(world.people).filter((p) => p.alive && !p.retired && p.profession === 'journalist');
  const byline = (o: MediaOutlet, ev: WorldEvent): string | undefined => {
    const pool = journalists.filter((j) => (o.countryId ? j.countryId === o.countryId : j.fame > 40));
    const pick = pool.length ? pool : journalists;
    if (!pick.length || rng.next() > 0.7) return undefined;
    const j = rng.pickWeighted(pick, (x) => x.fame + 10 + (ev.location.countryId === x.countryId ? 20 : 0));
    j.fame = Math.min(100, j.fame + 0.3 * ev.severity);
    return j.id;
  };
  for (const ev of todays) {
    if (ev.severity < 2 && rng.next() > 0.35) continue;
    // Which outlets cover it? Home outlets always for sev>=2; internationals for sev>=3; others by relevance.
    const covering = outlets.filter((o) => {
      const home = o.countryId && (ev.location.countryId === o.countryId || ev.actors.some((a) => a.kind === 'country' && a.id === o.countryId));
      if (home) return ev.severity >= 2 || rng.bool(0.6);
      if (!o.countryId) return ev.severity >= 3 || (ev.severity === 2 && rng.bool(0.25));
      if (o.bias === 'business' && (ev.category === 'economic' || ev.category === 'corporate')) return ev.severity >= 3 || rng.bool(0.3);
      return ev.severity >= 4 && rng.bool(0.6) || (ev.severity === 3 && rng.bool(0.12));
    });
    const chosen = covering.length > 5 ? rng.sample(covering, 5) : covering;
    for (const o of chosen) {
      const h = provider.headline(world, ev, o, rng);
      out.push({ id: nextId(world, 'n'), day: world.day, outletId: o.id, authorId: byline(o, ev), eventId: ev.id, headline: h.headline, body: h.body, tone: h.tone, reach: Math.round(o.audience * (0.3 + ev.severity / 5) * 10) / 10 });
    }
  }
  world.news.push(...out);
  if (world.news.length > MAX_NEWS) world.news.splice(0, world.news.length - MAX_NEWS);
  return out;
}

export function generateSocial(world: World, rng: RNG, todays: WorldEvent[]): SocialPost[] {
  const out: SocialPost[] = [];
  const people = Object.values(world.people).filter((p) => p.alive && p.socialActivity > 0.05);
  if (!people.length) return out;
  // Event reactions
  for (const ev of todays) {
    const n = ev.severity >= 4 ? rng.int(4, 8) : ev.severity === 3 ? rng.int(2, 4) : ev.severity === 2 ? rng.int(0, 2) : rng.bool(0.3) ? 1 : 0;
    if (!n) continue;
    const local = people.filter((p) => p.countryId === ev.location.countryId);
    const pool = local.length && rng.bool(0.6) ? local : people;
    const authors = rng.sample(pool, Math.min(n, pool.length));
    for (const a of authors) {
      if (rng.next() > a.socialActivity * 0.8 + 0.2) continue;
      const post = makePost(world, rng, a, ev);
      out.push(post);
      // Viral posts get quote-reposted by other public figures with their own spin.
      if (post.viral && rng.bool(0.5)) {
        const q = rng.pickWeighted(people.filter((x) => x.id !== a.id && x.fame > 30), (x) => x.fame);
        if (q) {
          const agree = rng.next() < 0.5 + (q.ideology === a.ideology ? 0.2 : -0.2);
          const lead = agree ? rng.pick(['This.', 'Exactly right.', 'Worth reading twice.', 'Signal-boosting.']) : rng.pick(['Wrong on every count.', 'This is how misinformation spreads.', 'Respectfully: no.', 'Read this and then read the actual facts.']);
          const excerpt = post.text.length > 90 ? post.text.slice(0, 87) + '…' : post.text;
          out.push({ id: nextId(world, 's'), day: world.day, authorId: q.id, text: `${lead} ↻ @${a.socialHandle}: “${excerpt}”`, hashtags: post.hashtags.slice(0, 1), likes: Math.round(post.likes * rng.float(0.1, 0.6)), reposts: Math.round(post.reposts * rng.float(0.1, 0.4)), replies: 0, eventId: ev.id, sentiment: agree ? post.sentiment : -post.sentiment, viral: false });
        }
      }
      // Replies
      const nReplies = post.viral ? rng.int(1, 3) : rng.bool(0.3) ? 1 : 0;
      for (let i = 0; i < nReplies; i++) {
        const r = rng.pick(people);
        if (r.id === a.id) continue;
        const rep = provider.reply(world, post, r, rng);
        out.push({ id: nextId(world, 's'), day: world.day, authorId: r.id, text: rep.text, hashtags: [], likes: Math.round(post.likes * rng.float(0.01, 0.2)), reposts: 0, replies: 0, eventId: ev.id, sentiment: rep.sentiment, viral: false, replyTo: post.id });
        post.replies++;
      }
    }
  }
  // Ambient posts
  const ambient = rng.int(1, 3);
  for (let i = 0; i < ambient; i++) {
    const a = rng.pickWeighted(people, (p) => p.socialActivity * (1 + p.fame / 50));
    out.push(makePost(world, rng, a, null));
  }
  world.social.push(...out);
  if (world.social.length > MAX_SOCIAL) world.social.splice(0, world.social.length - MAX_SOCIAL);
  return out;
}

function makePost(world: World, rng: RNG, a: Person, ev: WorldEvent | null): SocialPost {
  const r = provider.post(world, ev, a, rng);
  const audience = a.fame * 1000 + 500;
  const engagement = rng.float(0.01, 0.2) * (1 + Math.abs(r.sentiment)) * (ev ? 1 + ev.severity / 3 : 0.5);
  const likes = Math.round(audience * engagement);
  const viral = likes > 25_000 || (ev !== null && ev.severity >= 4 && rng.bool(0.3));
  return { id: nextId(world, 's'), day: world.day, authorId: a.id, text: r.text, hashtags: r.hashtags, likes: viral ? likes * rng.int(3, 12) : likes, reposts: Math.round(likes * rng.float(0.05, 0.4)), replies: 0, eventId: ev?.id, sentiment: r.sentiment, viral };
}

export function updateTrending(world: World): void {
  const counts = new Map<string, number>();
  const since = world.day - 3;
  for (const p of world.social) {
    if (p.day < since) continue;
    const w = 1 + Math.log10(1 + p.likes);
    for (const h of p.hashtags) counts.set(h, (counts.get(h) ?? 0) + w);
  }
  world.trending = Array.from(counts.entries()).map(([tag, count]) => ({ tag, count: Math.round(count) })).sort((a, b) => b.count - a.count).slice(0, 8);
}

/** Public sentiment toward a person derived from recent social posts mentioning events they were part of. */
export function sentimentFor(world: World, personId: string): number {
  let s = 0, n = 0;
  for (const post of world.social.slice(-300)) {
    if (!post.eventId) continue;
    const ev = world.events.find((e) => e.id === post.eventId);
    if (ev && ev.actors.some((a) => a.kind === 'person' && a.id === personId)) { s += post.sentiment; n++; }
  }
  return n ? clamp(s / n, -1, 1) : 0;
}
