/**
 * Narrative provider abstraction.
 *
 * The simulation core is synchronous and deterministic: every headline, article
 * and social post is produced by `LocalNarrativeProvider` from templates.
 * An optional asynchronous `LLMNarrativeProvider` can *enhance* that text after
 * the fact (see `enhancer.ts`) without the simulation depending on it.
 *
 * See docs/AI_SYSTEM.md and prompts/ for the prompt templates used by the LLM path.
 */
import { RNG } from '../rng';
import type { World, WorldEvent, MediaOutlet, Person, NewsArticle, SocialPost } from '../types';
import { entityName } from '../events/engine';

export interface HeadlineResult { headline: string; body: string; tone: NewsArticle['tone']; }
export interface PostResult { text: string; hashtags: string[]; sentiment: number; }

export interface NarrativeProvider {
  readonly id: string;
  headline(world: World, ev: WorldEvent, outlet: MediaOutlet, rng: RNG): HeadlineResult;
  post(world: World, ev: WorldEvent | null, author: Person, rng: RNG): PostResult;
  reply(world: World, original: SocialPost, author: Person, rng: RNG): PostResult;
}

// ---------------------------------------------------------------------------
// Local deterministic implementation
// ---------------------------------------------------------------------------
const OUTLET_PREFIX: Record<MediaOutlet['bias'], string[]> = {
  establishment: ['', '', 'Officials confirm: ', 'Analysis: '],
  opposition: ['EXPOSED: ', 'Government silent as ', 'What they won\'t tell you: ', ''],
  sensational: ['SHOCK: ', 'BREAKING: ', 'CHAOS: ', 'YOU WON\'T BELIEVE: ', 'PANIC: '],
  business: ['Markets: ', 'Investors watch as ', '', 'Outlook: '],
  international: ['', 'World: ', 'Region in focus: ', ''],
  independent: ['', 'Explainer: ', 'On the ground: ', ''],
  state: ['Leadership responds decisively as ', 'Nation united: ', '', 'Foreign agitators blamed as '],
};

const BODY_OPENERS: Record<MediaOutlet['bias'], string[]> = {
  establishment: ['According to officials briefed on the matter,', 'Senior sources confirmed that', 'In a measured statement,'],
  opposition: ['Despite the official narrative,', 'Critics were quick to note that', 'Once again,'],
  sensational: ['Nobody saw this coming.', 'Total chaos.', 'The world is holding its breath.'],
  business: ['Traders reacted within minutes.', 'The numbers tell the story.', 'For investors, the implications are immediate.'],
  international: ['From our correspondent:', 'The regional picture is shifting.', 'Observers across the world are watching closely.'],
  independent: ['Here is what we know so far.', 'We spoke to people on the ground.', 'The facts are still emerging, but'],
  state: ['The leadership has the situation firmly in hand.', 'Citizens can be reassured that', 'Hostile foreign media have distorted the facts.'],
};

export class LocalNarrativeProvider implements NarrativeProvider {
  readonly id = 'local';

  headline(world: World, ev: WorldEvent, outlet: MediaOutlet, rng: RNG): HeadlineResult {
    const homeCountry = outlet.countryId;
    const involvesHome = !!homeCountry && (ev.location.countryId === homeCountry || ev.actors.some((a) => a.kind === 'country' && a.id === homeCountry));
    const negative = isNegative(ev);
    let tone: NewsArticle['tone'] = negative ? 'negative' : ev.severity >= 3 ? 'positive' : 'neutral';
    if (outlet.bias === 'sensational') tone = 'alarmist';
    if (outlet.bias === 'state' && involvesHome) tone = negative ? 'neutral' : 'positive';
    if (outlet.bias === 'opposition' && involvesHome) tone = 'negative';
    let headline = rng.pick(OUTLET_PREFIX[outlet.bias]) + ev.title;
    if (outlet.bias === 'sensational') headline = headline.toUpperCase().slice(0, 1) + headline.slice(1).replace(/\.$/, '') + rng.pick(['!', '', ' — what happens next?']);
    if (outlet.bias === 'business') headline = tweakBusiness(ev, headline, rng);
    const opener = rng.pick(BODY_OPENERS[outlet.bias]);
    const spin = spinFor(world, ev, outlet, rng, involvesHome);
    // When the opener ends mid-sentence ("...confirmed that"), continue the sentence in lower case unless it starts with a proper noun.
    const midSentence = /(that|,)$/.test(opener);
    const desc = midSentence && /^(The|A|An|After|In|Under|Following|Voters|Armored|Investors|Health|Geologists|Traders|Leaders|Negotiators|Citing|Heavy|Thousands|Hundreds|Crowds|Troops|Live|Emergency|Cargo|Magazine|Rattled|Laid|Former|Building|Despite|Polls|Mass|Construction|Reading|Unable|Officials|Scientists|Engineers|Authorities|Banks|Fuel|Investment|Rescue|Bombings|Ministries|Followers|Licensing|Analysts|Insurance|Damage|Foreign|Unemployment|Austerity)\b/.test(ev.description) ? ev.description.charAt(0).toLowerCase() + ev.description.slice(1) : ev.description;
    const body = `${opener} ${desc} ${spin}`.replace(/\s+/g, ' ').trim();
    return { headline, body, tone };
  }

  post(world: World, ev: WorldEvent | null, author: Person, rng: RNG): PostResult {
    if (!ev) return idlePost(world, author, rng);
    const stance = stanceOf(world, author, ev);
    const tags = hashtagsFor(world, ev, rng);
    const text = composePost(world, ev, author, stance, rng);
    return { text, hashtags: tags, sentiment: stance };
  }

  reply(world: World, original: SocialPost, author: Person, rng: RNG): PostResult {
    const agree = rng.next() < 0.5 + (author.personality.openness - 0.5) * 0.3;
    const pool = agree
      ? ['Exactly this.', 'Finally someone says it.', 'This. A thousand times this.', 'Couldn\'t agree more.', 'Sharing everywhere.', 'Thank you for saying it out loud.', 'Been saying this for years.']
      : ['Absolutely not.', 'This is dangerously wrong.', 'Do you even read the news?', 'Ratio incoming.', 'Delete this.', 'Wildly irresponsible take.', 'Source? Didn\'t think so.', 'Imagine posting this unironically.'];
    const flavor = author.profession === 'journalist' ? ' I\'ve reported on this.' : author.profession === 'scientist' ? ' The data does not support the hysteria.' : author.profession === 'politician' ? ' My office is monitoring the situation.' : '';
    return { text: rng.pick(pool) + (rng.bool(0.4) ? flavor : ''), hashtags: [], sentiment: agree ? original.sentiment : -original.sentiment };
  }
}

export function isNegative(ev: WorldEvent): boolean {
  if (['military', 'environmental', 'criminal', 'health'].includes(ev.category)) return !['war.ended', 'vaccine', 'outbreak.contained', 'aid'].includes(ev.type);
  return /collapse|crisis|crash|scandal|coup|bankrupt|protest|strike|death|assassin|crackdown|flop|failure|downfall|tension\.rise|cyber|migration|clash|alliance\.broken/.test(ev.type + ' ' + ev.title.toLowerCase());
}

function tweakBusiness(ev: WorldEvent, h: string, rng: RNG): string {
  if (ev.category === 'economic' || ev.category === 'corporate') return h;
  return h + rng.pick([': what it means for markets', ' — sector impact', '', ': analysts weigh in']);
}

function spinFor(world: World, ev: WorldEvent, outlet: MediaOutlet, rng: RNG, home: boolean): string {
  const leaderName = ev.location.countryId ? world.people[world.countries[ev.location.countryId]?.leaderId ?? '']?.name : undefined;
  switch (outlet.bias) {
    case 'establishment': return rng.pick(['Officials urged calm and promised a full review.', 'The situation is expected to stabilize in the coming weeks.', 'Experts described the development as significant but manageable.']);
    case 'opposition': return home ? rng.pick([`${leaderName ?? 'The government'} has yet to explain how this was allowed to happen.`, 'This is the direct result of years of neglect at the top.', 'Questions are mounting about who knew what, and when.']) : rng.pick(['Our own government should take note.', 'Compare this with the silence at home.', 'Accountability, for once, may follow.']);
    case 'sensational': return rng.pick(['Sources say the worst may be yet to come.', 'Insiders are terrified.', 'This changes EVERYTHING.', 'Is anyone safe?']);
    case 'business': return rng.pick(['Analysts expect volatility to persist through the quarter.', 'Exposure is concentrated in a handful of listed names.', 'Bond markets have so far shrugged off the news.', 'Watch the currency.']);
    case 'international': return rng.pick(['Neighboring capitals are recalibrating their positions.', 'The implications extend well beyond the region.', 'Diplomats privately admit the outcome is unpredictable.']);
    case 'independent': return rng.pick(['We will continue to verify claims as they arrive.', 'Readers on the ground describe a tense but orderly situation.', 'Much of the official account remains unverified.']);
    case 'state': return home ? rng.pick([`${leaderName ?? 'The leadership'} has taken personal charge of the response.`, 'The nation stands united behind its institutions.', 'Enemies of the state will not succeed in sowing panic.']) : rng.pick(['The chaos abroad contrasts with stability at home.', 'Foreign governments have once again shown their weakness.']);
  }
}

function stanceOf(world: World, p: Person, ev: WorldEvent): number {
  const negative = isNegative(ev);
  let s = negative ? -0.6 : 0.5;
  const c = world.countries[p.countryId];
  const involvesHome = ev.location.countryId === p.countryId || ev.actors.some((a) => a.kind === 'country' && a.id === p.countryId);
  const isAboutLeader = ev.actors.some((a) => a.kind === 'person' && a.id === c?.leaderId);
  if (involvesHome) s *= 1.4;
  if (isAboutLeader) s += (p.ideology === c?.ideology ? 0.3 : -0.3) * (negative ? -1 : 1);
  if (ev.category === 'military' && p.personality.aggression > 0.6) s += 0.3;
  if (ev.category === 'environmental' && p.ideology === 'green') s -= 0.2;
  if (ev.category === 'technological' && p.personality.openness > 0.6) s += 0.3;
  if (ev.actors.some((a) => a.kind === 'person' && a.id === p.id)) s = negative ? -0.9 : 0.9;
  return Math.max(-1, Math.min(1, s));
}

export function hashtagsFor(world: World, ev: WorldEvent, rng: RNG): string[] {
  const tags: string[] = [];
  const country = ev.location.countryId ? world.countries[ev.location.countryId] : undefined;
  if (country) tags.push(country.name.replace(/\s+/g, ''));
  const byType: Record<string, string[]> = {
    'war.declared': ['War', 'StopTheWar', 'StandWith' + (country?.name.replace(/\s+/g, '') ?? '')], 'war.ended': ['Peace', 'Ceasefire'], 'tech.breakthrough': ['Breakthrough', 'FutureIsNow', 'Science'],
    'economy.crisis': ['Crisis', 'Recession'], 'economy.crash': ['MarketCrash', 'Crash'], 'economy.boom': ['Boom', 'Bullish'], 'leader.election': ['Election', 'Vote'], 'leader.coup': ['Coup', 'Democracy'],
    'leader.revolution': ['Revolution', 'PowerToThePeople'], scandal: ['Scandal', 'Resign'], 'protest.mass': ['Protest', 'Enough'], protest: ['Protest'], 'government.collapse': ['Collapse', 'Anarchy'],
    'health.pandemic': ['Pandemic', 'StayHome'], 'health.epidemic': ['Outbreak'], 'company.bankrupt': ['Bankrupt', 'RIP'], 'product.launch': ['Launch', 'Innovation'], cyberattack: ['CyberAttack', 'Hacked'],
    'movement.founded': ['Movement', 'Rise'], 'country.founded': ['Independence', 'NewNation'], discovery: ['Discovery', 'Science'], 'death.assassination': ['Assassination', 'Justice'],
  };
  const kind = ev.type.startsWith('disaster.') ? ['PrayFor' + (country?.name.replace(/\s+/g, '') ?? 'Them'), 'Disaster'] : byType[ev.type] ?? [ev.category.charAt(0).toUpperCase() + ev.category.slice(1)];
  tags.push(...kind);
  for (const a of ev.actors) if (a.kind === 'person' && rng.bool(0.4)) { const p = world.people[a.id]; if (p) tags.push(p.lastName.replace(/[^A-Za-z]/g, '')); }
  for (const a of ev.actors) if (a.kind === 'company' && rng.bool(0.6)) { const c = world.companies[a.id]; if (c) tags.push(c.ticker); }
  return Array.from(new Set(tags)).slice(0, 3);
}

function composePost(world: World, ev: WorldEvent, p: Person, stance: number, rng: RNG): string {
  const short = ev.title.length > 80 ? ev.title.slice(0, 77) + '…' : ev.title;
  // Personal ties first: people react to what happens to family, partners, allies and enemies.
  const negative = isNegative(ev);
  for (const a of ev.actors) {
    if (a.kind !== 'person' || a.id === p.id) continue;
    const rel = p.relationships.find((r) => r.target.id === a.id); const o = world.people[a.id];
    if (!rel || !o) continue;
    const first = o.firstName;
    if (rel.type === 'family' || rel.type === 'partner') return negative
      ? rng.pick([`Please respect our family's privacy right now. ${first} needs us, not headlines.`, `I have nothing to say about ${first} except this: I am here.`, `To everyone sending love for ${first}: thank you. It matters.`])
      : rng.pick([`So proud of ${first} today. ${short}`, `${first} did it. I always knew. ❤️`, `Family dinner is going to be insufferable now. Congratulations ${first}.`]);
    if (rel.strength < -0.3) return negative
      ? rng.pick([`Not surprised about ${o.name}. Some of us said this years ago.`, `Imagine my shock. ${short}.`, `I won't gloat about ${first}. Actually, yes I will.`, `Consequences finally arrive for ${o.name}. About time.`])
      : rng.pick([`Let's not pretend ${o.name} earned this.`, `${short}. Funny how these things get decided.`, `Congratulations to ${o.name}, I suppose. We all know the truth.`]);
    if (rel.strength > 0.3) return negative
      ? rng.pick([`Standing with ${o.name}. Anyone who knows them knows the truth.`, `${first} has my full support. Judge the facts, not the noise.`, `Thinking of ${first} tonight.`])
      : rng.pick([`Nobody deserves this more than ${o.name}. ${short}`, `Called it. ${first} is the real thing.`, `Raising a glass to ${first} tonight.`]);
  }
  const lc = short; // keep proper nouns intact inside sentences
  const country = ev.location.countryId ? world.countries[ev.location.countryId] : undefined;
  const isActor = ev.actors.some((a) => a.kind === 'person' && a.id === p.id);
  if (isActor) return rng.pick([
    `Regarding today's reports: ${stance > 0 ? 'I am deeply grateful for the support.' : 'the claims are false and I will respond in full.'}`,
    `${stance > 0 ? 'Proud moment.' : 'Difficult day.'} ${stance > 0 ? 'None of this was possible alone.' : 'I will not be intimidated.'}`,
    `To everyone asking: ${stance > 0 ? 'yes, it\'s real. More soon.' : 'I have nothing to hide. Statement coming.'}`,
  ]);
  const byProfession: Record<string, string[]> = {
    journalist: [`Confirmed by two sources: ${short}`, `Thread on "${lc}" — what the official statement leaves out. 1/`, `I've covered ${country?.name ?? 'this region'} for years. ${stance < 0 ? 'This is worse than it looks.' : 'This is bigger than it looks.'}`],
    politician: [`${stance > 0 ? 'Welcome news.' : 'Unacceptable.'} ${short}. ${stance > 0 ? 'We will build on it.' : 'Those responsible must be held to account.'}`, `My thoughts are with everyone affected. ${stance < -0.5 ? 'We demand answers.' : 'We stand ready to help.'}`],
    scientist: [`Reading the reports: "${lc}". ${stance > 0 ? 'The methodology looks sound.' : 'Extraordinary claims require extraordinary evidence.'}`, `As someone who works in this field: ${stance > 0 ? 'this is genuinely exciting.' : 'please wait for replication.'}`],
    entrepreneur: [`${short}. ${stance > 0 ? 'Massive opportunity.' : 'Markets will punish this.'}`, `Builders, take note: ${lc}. ${stance > 0 ? 'The window is open.' : 'Plan for volatility.'}`],
    activist: [`${short}. ${stance < 0 ? 'THIS is why we march.' : 'Proof that pressure works.'}`, `They said it couldn't happen. ${short}. Organize.`],
    celebrity: [`${stance > 0 ? '❤️' : '💔'} ${short}`, `Can't stop thinking about this: ${lc}. ${stance < 0 ? 'Sending love to everyone affected.' : 'What a time to be alive.'}`],
    general: [`${short}. ${stance < 0 ? 'Readiness is not optional.' : 'Discipline wins.'}`],
    criminal: [`Interesting times. ${lc}. 👀`, `Everything is for sale, especially now.`],
    executive: [`Statement regarding "${lc}": we are monitoring closely and our priority remains our people and customers.`, `${stance > 0 ? 'Bullish.' : 'Bracing.'} ${short}.`],
    artist: [`${short}. Working on something about this.`, `${stance < 0 ? 'Grief' : 'Hope'} is the only honest response. ${lc}.`],
    diplomat: [`Dialogue remains the only path. ${short}.`, `Quiet talks continue despite everything. ${lc}.`],
    athlete: [`${short}. ${stance > 0 ? 'Let\'s go!' : 'Stay strong everyone.'}`],
    engineer: [`Technically speaking, this is ${stance > 0 ? 'impressive' : 'a mess'}: ${lc}. Details in replies.`],
    citizen: [`so this just happened: ${lc}. ${stance < 0 ? 'cool cool cool. everything is fine.' : 'ok this is actually amazing'}`, `${short}?? ${stance < 0 ? 'what is happening to this country' : 'finally some good news'}`, `my grandmother just called me about the news (${lc}). she is ${stance < 0 ? 'furious' : 'crying happy tears'}.`],
    'religious-leader': [`In times like these we return to what endures. ${lc}.`],
  };
  const pool = byProfession[p.profession] ?? byProfession.citizen;
  let text = rng.pick(pool);
  if (p.traits.includes('cynical') && rng.bool(0.5)) text += ' As if anyone is surprised.';
  if (p.traits.includes('volatile') && rng.bool(0.5)) text = text.toUpperCase();
  if (p.traits.includes('eccentric') && rng.bool(0.4)) text += ' 🌀';
  return text;
}

function idlePost(world: World, p: Person, rng: RNG): PostResult {
  const c = world.countries[p.countryId];
  const city = world.cities[p.cityId];
  const pool = [
    `Morning in ${city?.name ?? 'the city'}. ${c && c.happiness > 60 ? 'Good to be here.' : 'Rough week for everyone.'}`,
    `Working on my goal: ${p.objective}. Slowly.`,
    `Hot take: ${rng.pick(['the markets are lying to you', 'nobody reads past the headline', 'this decade will be remembered for one thing', 'we are all underestimating what comes next', 'the real story is never on the front page'])}.`,
    `Reminder that ${c?.name ?? 'this country'} deserves better than ${rng.pick(['this', 'the current chaos', 'what passes for leadership', 'yesterday\'s news cycle'])}.`,
    `${rng.pick(['Coffee', 'Rain', 'Deadlines', 'Traffic'])} in ${city?.name ?? 'town'} today. ${rng.pick(['Sending strength.', 'Onward.', 'Ugh.', 'Living the dream.'])}`,
  ];
  return { text: rng.pick(pool), hashtags: rng.bool(0.3) ? [c?.name.replace(/\s+/g, '') ?? 'World'] : [], sentiment: (c?.happiness ?? 50) > 55 ? 0.3 : -0.3 };
}

export const localNarrative = new LocalNarrativeProvider();
export { entityName };
