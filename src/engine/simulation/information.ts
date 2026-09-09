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

/**
 * Weekly editorials: each week a few outlets publish an opinion piece about the
 * story that dominated their audience's week, spun through the outlet's bias.
 */
export function generateEditorials(world: World, rng: RNG): NewsArticle[] {
  const out: NewsArticle[] = [];
  const week = world.events.filter((e) => world.day - e.day < 7 && e.severity >= 3);
  if (!week.length) return out;
  const outlets = Object.values(world.outlets).filter((o) => o.audience > 5);
  const chosen = rng.sample(outlets, Math.min(outlets.length, rng.int(2, 4)));
  const journalists = Object.values(world.people).filter((p) => p.alive && !p.retired && p.profession === 'journalist');
  for (const o of chosen) {
    const relevant = week.filter((e) => !o.countryId || e.location.countryId === o.countryId || e.actors.some((a) => a.kind === 'country' && a.id === o.countryId));
    const pool = relevant.length ? relevant : week;
    const ev = pool.reduce((best, e) => (e.severity > best.severity || (e.severity === best.severity && e.day > best.day) ? e : best), pool[0]);
    const c = ev.location.countryId ? world.countries[ev.location.countryId] : undefined;
    const home = !!o.countryId && c?.id === o.countryId;
    const leader = c ? world.people[c.leaderId] : undefined;
    const subject = c ? c.name : 'the world';
    const negative = /collapse|crisis|crash|scandal|coup|bankrupt|protest|death|assassin|war\.declared|battle|crackdown|disaster|epidemic|pandemic|purge|cyber|attack|shock|sanction|feud/.test(ev.type);
    const heads: Record<typeof o.bias, string[]> = {
      establishment: [`Editorial: steady hands are what ${subject} needs now`, `Our view: after ${ev.title.toLowerCase().replace(/[.!]$/, '')}, keep calm and trust the process`, `Editorial: a week that tested ${subject}, and institutions that held`],
      opposition: [`Editorial: ${leader?.name ?? 'the government'} owns this week`, `Our view: how many warnings did ${leader?.name ?? 'the leadership'} ignore?`, `Editorial: ${subject} deserves better than this`],
      sensational: [`WEEK OF CHAOS: what they are not telling you about ${subject}`, `THE TRUTH about ${ev.title.split(' ').slice(0, 5).join(' ')}…`, `${subject.toUpperCase()} ON THE BRINK?`],
      business: [`The bottom line: what ${ev.title.toLowerCase().replace(/[.!]$/, '')} means for your portfolio`, `Column: markets are ${negative ? 'underpricing' : 'overpricing'} ${subject}`, `Editorial: the price of a week like this one`],
      international: [`Analysis: ${subject}'s week, seen from outside`, `The week in ${subject}: what the region is quietly preparing for`, `Editorial: the world cannot look away from ${subject}`],
      independent: [`What we verified this week, and what we couldn't`, `Editorial: the ${negative ? 'questions nobody in power wants asked' : 'good news that deserves scrutiny too'}`, `A week in ${subject}, without the spin`],
      state: [`Editorial: ${subject} stands united`, `The nation answers ${negative ? 'adversity' : 'the moment'} with resolve`, `Editorial: foreign voices will not decide ${subject}'s future`],
    };
    const bodies: Record<typeof o.bias, string> = {
      establishment: `${ev.title}. It was the story of the week, and it will not be the last shock of the year. But ${subject} has weathered worse, and the institutions that got us here remain the ones most likely to get us through. ${home && leader ? `${leader.name} would do well to listen more and announce less.` : 'Patience is not the same as complacency.'}`,
      opposition: `${ev.title}. ${home && leader ? `${leader.name} would like you to believe this came out of nowhere. It did not.` : 'Those in charge would like you to believe this came out of nowhere. It did not.'} The warnings were public, the choices were made, and the people now paying the price are not the ones who made them. ${c && c.approval < 45 ? 'The polls suggest voters have noticed.' : 'Accountability starts with admitting that.'}`,
      sensational: `${ev.title}, and that is only what they admit to. Our sources describe a week of panic behind closed doors${c ? ` in ${world.cities[c.capitalId]?.name ?? c.name}` : ''}. ${negative ? 'Is the worst still to come? Nobody we spoke to would rule it out.' : 'Is it too good to be true? Some insiders think so.'}`,
      business: `${ev.title}. Strip away the politics and the question for investors is simple: does this change earnings? ${negative ? 'In the short term, yes. Exposure is concentrated, and the smart money is already rotating.' : 'Probably less than the headlines suggest, which is exactly when opportunities appear.'} Watch ${c ? `the ${c.adjective} currency` : 'the commodity complex'} next week.`,
      international: `${ev.title}. From the outside, the pattern is familiar: ${negative ? 'a shock, a scramble, and neighbours recalculating their positions' : 'a success that rivals will study and try to copy'}. ${c && c.alliances.length ? `${c.name}'s allies have so far said the right things.` : 'Diplomats are, as ever, cautious.'} The region is preparing for a different year than the one it expected.`,
      independent: `${ev.title}. Here is what we can confirm, and here is what remains unverified: much of the official account. Readers on the ground describe ${negative ? 'a tense but orderly week' : 'cautious optimism'}. We will keep asking the questions; whether we get answers is up to ${home && leader ? leader.name : 'those in power'}.`,
      state: `${ev.title}. ${negative ? 'Adversity reveals character, and this week revealed the character of ' : 'This week showed the world the strength of '}${subject}. ${leader && home ? `Under ${leader.name}'s leadership, the nation` : 'The nation'} moves forward together, undistracted by foreign commentary and domestic doubters alike.`,
    };
    const pool2 = journalists.filter((j) => (o.countryId ? j.countryId === o.countryId : j.fame > 40));
    const j = pool2.length && rng.bool(0.8) ? rng.pickWeighted(pool2, (x) => x.fame + 10) : undefined;
    if (j) j.fame = Math.min(100, j.fame + 0.5);
    const tone: NewsArticle['tone'] = o.bias === 'sensational' ? 'alarmist' : o.bias === 'opposition' ? 'negative' : o.bias === 'state' || o.bias === 'establishment' ? 'positive' : negative ? 'negative' : 'neutral';
    out.push({ id: nextId(world, 'n'), day: world.day, outletId: o.id, authorId: j?.id, eventId: ev.id, headline: rng.pick(heads[o.bias]), body: bodies[o.bias], tone, reach: Math.round(o.audience * 0.5 * 10) / 10, editorial: true });
  }
  world.news.push(...out);
  return out;
}

export function generateSocial(world: World, rng: RNG, todays: WorldEvent[]): SocialPost[] {
  const out: SocialPost[] = [];
  const people = Object.values(world.people).filter((p) => p.alive && p.socialActivity > 0.05);
  if (!people.length) return out;
  // Characters the player interviewed talk about it the next day — the conversation leaks into the feed.
  for (const p of people) {
    const m = p.memories.filter((x) => x.text.startsWith('Was asked') && x.day >= world.day - 2 && x.day < world.day).slice(-1)[0];
    if (!m || rng.next() > 0.35 * p.socialActivity + 0.1) continue;
    const q = m.text.match(/Was asked "([^"]+)"/)?.[1] ?? 'a question';
    const a = m.text.split('answered: ')[1] ?? '';
    const text = rng.pick([
      `Someone asked me "${q}" yesterday. ${a ? `I said: ${a}` : 'I gave an honest answer.'} ${p.traits.includes('cynical') ? 'They looked disappointed.' : 'Still thinking about it.'}`,
      `Strange interview yesterday. "${q}". ${a ? `My answer stands: ${a}` : 'I answered, for once.'}`,
      `For the record, since it is being quoted: when asked "${q}", ${a ? `I said ${a}` : 'I told the truth'}.`,
    ]);
    out.push({ id: nextId(world, 's'), day: world.day, authorId: p.id, text: text.length > 260 ? text.slice(0, 257) + '…' : text, hashtags: ['Interview'], likes: Math.round(p.fame * rng.float(2, 20)), reposts: Math.round(p.fame * rng.float(0.1, 2)), replies: 0, sentiment: 0, viral: false });
    p.memories = p.memories.filter((x) => x !== m); // said once
  }
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
