/**
 * Freeform God Command interpreter.
 *
 * `GodCommandInterpreter` is the abstraction; `LocalGodInterpreter` is a
 * deterministic keyword/entity matcher that turns natural language into a
 * structured `GodPlan`. An LLM-backed interpreter can produce the same
 * structure (see docs/AI_SYSTEM.md and prompts/god_command.md).
 */
import type { Region, World, Country, Company, Person, Sector, EntityRef } from '../types';
import { SECTORS } from '../types';

export interface GodPlan {
  /** preset id from presets.ts, or one of the special composite intents */
  action: string;
  params: Record<string, string>;
  /** Human-readable explanation of what the interpreter understood. */
  interpretation: string;
  confidence: number; // 0..1
  /** Text overrides for the produced event (title/description) */
  customTitle?: string;
  customDescription?: string;
  magnitude?: number;
  /** Days from now to carry out the plan (0/undefined = immediately). Parsed from "in 3 months", "next year", "after two weeks". */
  delayDays?: number;
  targets: EntityRef[];
}

export interface GodCommandInterpreter {
  readonly id: string;
  interpret(world: World, text: string): Promise<GodPlan> | GodPlan;
}

const SECTOR_KEYWORDS: Record<string, Sector> = {
  battery: 'energy', batteries: 'energy', energy: 'energy', solar: 'energy', fusion: 'energy', reactor: 'energy', oil: 'energy', grid: 'energy', power: 'energy',
  ai: 'technology', software: 'technology', chip: 'technology', chips: 'technology', quantum: 'technology', computer: 'technology', tech: 'technology', robot: 'manufacturing', robots: 'manufacturing',
  bank: 'finance', crypto: 'finance', currency: 'finance', finance: 'finance', payment: 'finance',
  car: 'manufacturing', cars: 'manufacturing', factory: 'manufacturing', steel: 'manufacturing',
  farm: 'agriculture', food: 'agriculture', crop: 'agriculture', grain: 'agriculture',
  weapon: 'defense', weapons: 'defense', missile: 'defense', drone: 'defense', defense: 'defense', military: 'defense',
  media: 'media', film: 'media', streaming: 'media', news: 'media', game: 'media',
  hospital: 'health', medicine: 'health', medical: 'health', health: 'health',
  airline: 'transport', shipping: 'transport', rail: 'transport', transport: 'transport', rocket: 'aerospace', space: 'aerospace', satellite: 'aerospace', mars: 'aerospace', moon: 'aerospace',
  shop: 'retail', retail: 'retail', store: 'retail', mine: 'mining', mining: 'mining', lithium: 'mining', copper: 'mining',
  gene: 'biotech', genetic: 'biotech', vaccine: 'biotech', drug: 'biotech', biotech: 'biotech', cancer: 'biotech', aging: 'biotech',
  construction: 'construction', building: 'construction', housing: 'construction',
};

interface Intent { action: string; test: RegExp; params?: (m: RegExpMatchArray) => Record<string, string>; }
const INTENTS: Intent[] = [
  { action: 'meteor', test: /\b(meteor|asteroid|comet)\b/i },
  { action: 'pandemic', test: /\b(pandemic|plague spreads worldwide|global outbreak)\b/i },
  { action: 'epidemic', test: /\b(epidemic|outbreak|virus|plague|disease)\b/i },
  { action: 'rains', test: /\b(make it rain|rains? (return|come|fall)|end (the|a) drought|break (the|a) drought|monsoon arrives|let it rain)\b/i },
  { action: 'disaster', test: /\b(earthquake|flood|hurricane|typhoon|drought|wildfire|volcano|eruption|tsunami|storm)s?\b/i, params: (m) => ({ kind: normalizeDisaster(m[1]) }) },
  { action: 'end-war', test: /\b(end|stop|cease|halt)s?\b.*\b(war|fighting|conflict)\b|\b(ceasefire|peace treaty|armistice)\b/i },
  { action: 'start-war', test: /\b(declare|start|launch|begin|wage)s?\b.*\bwar\b|\b(invade|invasion|attack)s?\b/i },
  { action: 'alliance', test: /\b(alliance|allied|ally|allies|pact|treaty)\b/i },
  { action: 'break-alliance', test: /\b(break|leave|quit|withdraw)s?\b.*\b(alliance|pact)\b|\bdiplomatic (breakdown|crisis)\b/i },
  { action: 'increase-tension', test: /\b(tension|hostil|rival|sanction|expel|standoff)/i },
  { action: 'reduce-tension', test: /\b(reconcil|détente|detente|thaw|normali[sz]e relations|make peace)/i },
  { action: 'revolution', test: /\b(revolution|uprising|overthrow|revolt|rebellion)\b/i },
  { action: 'coup', test: /\b(coup|junta|generals? seize)\b/i },
  { action: 'collapse-government', test: /\b(government|state|regime)\b.*\b(collapse|fall|fails?|crumble)s?\b|\b(collapse|fall)\b.*\b(government|regime|state)\b/i },
  { action: 'annex', test: /\b(annex(es|ed|ation)?|cedes?|seiz(e|es|ed) (the )?(region|province|coast|valley|highlands))\b/i },
  { action: 'autonomy', test: /\b(autonomy|self-rule|self rule|devolution|home rule|devolve)\b/i },
  { action: 'create-country', test: /\b(independen|seced|new (country|nation|state)|breaks? away|declares? (itself )?a (country|nation))/i },
  { action: 'change-government', test: /\b(becomes?|turns? into|transform|establish)\b.*\b(democracy|republic|monarchy|technocracy|autocracy|junta|theocracy|federation|oligarchy|council|dictatorship)\b/i, params: (m) => ({ gov: normalizeGov(m[2]) }) },
  { action: 'movement', test: /\b(movement|party|protest group|coalition|front)\b.*\b(form|found|creat|emerg|start|launch|born)|\b(form|found|creat|start|launch)s?\b.*\b(movement|party|coalition)\b/i },
  { action: 'religion', test: /\b(religion|cult|faith|church|prophet|belief movement)\b/i },
  { action: 'bankrupt', test: /\b(bankrupt|goes? under|collapse|insolven|liquidat)/i },
  { action: 'crash', test: /\b(market|stock|stocks|exchange)\b.*\b(crash|plunge|collapse|tank)|\b(crash|plunge)\b.*\b(market|stock)/i },
  { action: 'export-ban', test: /\b(bans?|halts?|stops?|embargo(es)?)\b[^.]*\b(grain|food|wheat)\b[^.]*\bexports?\b|\b(grain|food) export ban\b/i },
  { action: 'festival', test: /\b(film festival|festival|red carpet|film awards)\b/i },
  { action: 'trade-fair', test: /\b(trade fair|trade expo|expo|world'?s fair|trade show)\b/i },
  { action: 'famine', test: /\b(famine|harvests? fail|crop failure|food (prices?|shortage|crisis)|starv|hunger)\b/i },
  { action: 'energy-crisis', test: /\b(energy|fuel|oil|power|electricity)\b.*\b(crisis|shortage|blackout|rationing)|\bblackouts?\b/i },
  { action: 'crisis', test: /\b(recession|depression|economic crisis|financial crisis|economy\b.*\b(collapse|crash|crisis)|debt crisis|bank run)/i },
  { action: 'boom', test: /\b(boom|prosperity|economic miracle|golden age|economy\b.*\b(surge|soar|thrive))/i },
  { action: 'resource', test: /\b(discover|find|found|strike)s?\b.*\b(oil|gas|gold|lithium|minerals?|rare earth|water|diamond|reserves?|deposit)/i, params: (m) => ({ res: normalizeResource(m[2]) }) },
  { action: 'breakthrough', test: /\b(breakthrough|invent|discover|develop|unveil|creates?|achiev|build)s?\b.*\b(battery|technology|fusion|reactor|engine|chip|drug|cure|vaccine|ai|material|superconductor|computer|rocket|device|quantum|robot|energy|storage)/i },
  { action: 'discovery', test: /\b(discover|find|detect|prove)s?\b.*\b(life|alien|planet|particle|physics|dimension|cure|signal|civilization|species)/i },
  { action: 'accelerate-tech', test: /\b(accelerat|speed up|golden age of (science|technology|invention)|rapid progress)/i },
  { action: 'create-company', test: /\b(found|start|launch|creat|establish|open)s?\b.*\b(company|startup|firm|corporation|business|venture)\b|\b(company|startup|firm)\b.*\b(is )?(founded|created|launched)\b/i },
  { action: 'remove-figure', test: /\b(assassinat|killed|dies|death of|murder|vanish|disappear|kidnap)/i, params: (m) => ({ how: /assassin|murder|kill/i.test(m[0]) ? 'assassination' : /vanish|disappear|kidnap/i.test(m[0]) ? 'disappearance' : 'accident' }) },
  { action: 'referendum', test: /\b(referendum|plebiscite|vote on (its |their )?(status|independence|autonomy|future))\b/i },
  { action: 'election', test: /\b(snap election|early election|calls? (an )?election|hold(s|ing)? (an |free )?elections?|go(es)? to the polls|let the people vote|free elections?)\b/i },
  { action: 'romance', test: /\b(fall in love|falls in love|in love with|marr(y|ies|ied)|wedding|romance|become a couple|get together|date(s)?\b.*\bwith)\b/i },
  { action: 'feud', test: /\b(feud|rivals?|rivalry|sworn enem|turn against each other|hate each other|fall(s|ing)? out with|bitter enemies)\b/i },
  { action: 'scandal', test: /\b(scandal|corrupt|affair|leak|exposed|caught|bribe|embezzl)/i },
  { action: 'reveal-secret', test: /\b(secret|reveal|truth comes out)\b/i },
  { action: 'opinion-down', test: /\b(people|public|citizens|population)\b.*\b(turn against|lose faith|angry|hate|reject)|\bapproval\b.*\b(drop|fall|plunge|collapse)/i },
  { action: 'opinion-up', test: /\b(people|public|citizens|population)\b.*\b(rally|support|love|unite|behind)|\bapproval\b.*\b(rise|soar|surge)/i },
  { action: 'migration', test: /\b(migrat|refugee|flee|exodus|emigrat)/i },
  { action: 'destabilize', test: /\b(destabili|chaos|anarchy|unrest spreads|region\b.*\b(explode|burn))/i },
  { action: 'figure', test: /\b(new|young|unknown|rising)\b.*\b(leader|entrepreneur|scientist|artist|journalist|activist|celebrity|general|politician|star)\b|\b(becomes? famous|rises to fame|emerges as)/i },
];

const PROF_WORDS: Record<string, string> = { entrepreneur: 'entrepreneur', founder: 'entrepreneur', scientist: 'scientist', researcher: 'scientist', artist: 'artist', journalist: 'journalist', reporter: 'journalist', activist: 'activist', celebrity: 'celebrity', star: 'celebrity', general: 'general', politician: 'politician', leader: 'politician', athlete: 'athlete', engineer: 'engineer', priest: 'religious-leader', prophet: 'religious-leader', diplomat: 'diplomat', criminal: 'criminal' };

export class LocalGodInterpreter implements GodCommandInterpreter {
  readonly id = 'local';

  interpret(world: World, text: string): GodPlan {
    const t = text.trim();
    const lower = t.toLowerCase();
    const countries = findCountries(world, lower);
    const regions = findRegions(world, lower);
    const companies = findCompanies(world, lower);
    const people = findPeople(world, lower);
    const sector = findSector(lower);
    const magnitude = findMagnitude(lower);
    const delayDays = findDelay(lower);
    let intent: Intent | undefined; let match: RegExpMatchArray | null = null;
    for (const i of INTENTS) { const m = t.match(i.test); if (m) { intent = i; match = m; break; } }
    const params: Record<string, string> = intent?.params && match ? intent.params(match) : {};
    const notes: string[] = [];
    const targets: EntityRef[] = [];

    // Country params
    if (countries[0]) { params.a = countries[0].id; targets.push({ kind: 'country', id: countries[0].id }); }
    if (countries[1]) { params.b = countries[1].id; targets.push({ kind: 'country', id: countries[1].id }); }
    if (regions[0] && intent?.action === 'annex') { params.region = regions[0].id; params.b = regions[0].countryId; const annexer = countries.find((x) => x.id !== regions[0].countryId); if (annexer) params.a = annexer.id; else delete params.a; notes.push(`${regions[0].name} belongs to ${world.countries[regions[0].countryId]?.name ?? '?'}.`); }
    else if (regions[0]) { params.region = regions[0].id; if (!params.a || params.a !== regions[0].countryId) { params.a = regions[0].countryId; targets.unshift({ kind: 'country', id: regions[0].countryId }); } notes.push(`${regions[0].name} is a region of ${world.countries[regions[0].countryId]?.name ?? '?'}.`); }
    if (companies[0]) { params.co = companies[0].id; targets.push({ kind: 'company', id: companies[0].id }); if (!params.a) params.a = companies[0].countryId; }
    if (people[0]) { params.p = people[0].id; targets.push({ kind: 'person', id: people[0].id }); if (!params.a) params.a = people[0].countryId; }
    if (people[1]) { params.p2 = people[1].id; targets.push({ kind: 'person', id: people[1].id }); }
    if (sector) params.sector = sector;
    if (!countries.length) {
      const demonym = t.match(/\b([A-Z][a-z]+(?:ish|ian|ese|an|i|ic|ch))\b/);
      if (demonym) notes.push(`No country called "${demonym[1]}" exists in this world; picking a fitting nation.`);
    }
    let action = intent?.action ?? 'breakthrough';
    let confidence = intent ? 0.75 : 0.3;
    if (countries.length) confidence += 0.1; if (companies.length || people.length) confidence += 0.1;

    // Composite: "a small X company discovers/invents Y" → create company + breakthrough on it
    const wantsNewCompany = /\b(a|an|small|tiny|unknown|new|little|obscure)\b[^.]{0,40}\b(company|startup|firm|lab|laboratory)\b/i.test(t) && !companies.length;
    if (wantsNewCompany && (action === 'breakthrough' || action === 'create-company' || action === 'discovery')) {
      action = 'company-breakthrough';
      params.sector = sector ?? 'technology';
      notes.push(`Creating a new ${params.sector} company and giving it the breakthrough.`);
    }
    if (action === 'breakthrough' || action === 'company-breakthrough') {
      params.field = extractField(lower) ?? sector ?? 'technology';
    }
    if (action === 'figure') { const prof = Object.keys(PROF_WORDS).find((k) => lower.includes(k)); params.prof = prof ? PROF_WORDS[prof] : 'entrepreneur'; const nm = t.match(/\b(?:named|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/); if (nm) params.name = nm[1]; }
    if (action === 'create-country' || action === 'movement' || action === 'religion' || action === 'create-company') { const nm = t.match(/\b(?:named|called)\s+["“]?([A-Z][\w' ]{2,30}?)["”]?(?:[.,]|$)/); if (nm) params.name = nm[1].trim(); }
    if (action === 'remove-figure' && !people[0]) { const leaderOf = countries[0]; if (leaderOf && /\b(leader|president|king|queen|prime minister|chancellor)\b/i.test(t)) params.p = leaderOf.leaderId; }
    if (action === 'scandal' && !people[0] && countries[0] && /\b(leader|president|king|queen|prime minister|chancellor|government)\b/i.test(t)) params.p = countries[0].leaderId;
    if (action === 'increase-tension' && people.length >= 1 && !countries.length) action = 'feud';
    if (action === 'feud' && !people.length && countries.length) action = 'increase-tension';
    if (action === 'bankrupt' && !companies.length) { if (countries.length || people.length) action = 'collapse-government'; else notes.push('No company named; the largest fragile company will fall.'); }

    const interpretation = [
      `Intent: ${labelFor(action)}${magnitude !== 1 ? ` (magnitude ×${magnitude})` : ''}.`,
      delayDays ? `Scheduled: in ${describeDelay(delayDays)}.` : '',
      countries.length ? `Countries: ${countries.map((c) => c.name).join(', ')}.` : '',
      companies.length ? `Company: ${companies[0].name}.` : '',
      people.length ? `${people.length > 1 ? 'People' : 'Person'}: ${people.slice(0, 2).map((p) => p.name).join(' and ')}.` : '',
      sector ? `Sector: ${sector}.` : '',
      ...notes,
    ].filter(Boolean).join(' ');

    return { action, params, interpretation, confidence: Math.min(1, confidence), magnitude, delayDays: delayDays || undefined, targets, customTitle: undefined, customDescription: t.length > 20 ? capitalize(t.replace(/\s+/g, ' ')) : undefined };
  }
}

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
/** "in 3 months", "after two weeks", "next year", "a decade from now" → days. 0 when absent. */
export function findDelay(lower: string): number {
  const unit = (u: string) => (u.startsWith('day') ? 1 : u.startsWith('week') ? 7 : u.startsWith('month') ? 30 : u.startsWith('year') ? 365 : u.startsWith('decade') ? 3650 : 0);
  const m = lower.match(/\b(?:in|after|within)\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(days?|weeks?|months?|years?|decades?)\b/);
  if (m) { const n = NUM_WORDS[m[1]] ?? parseInt(m[1], 10); return Math.max(1, Math.round(n * unit(m[2]))); }
  const m2 = lower.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(days?|weeks?|months?|years?|decades?)\s+from\s+now\b/);
  if (m2) { const n = NUM_WORDS[m2[1]] ?? parseInt(m2[1], 10); return Math.max(1, Math.round(n * unit(m2[2]))); }
  const m3 = lower.match(/\bnext\s+(week|month|year|decade)\b/);
  if (m3) return unit(m3[1]);
  if (/\b(tomorrow)\b/.test(lower)) return 1;
  return 0;
}
export function describeDelay(days: number): string {
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? '' : 's'}`;
  if (days % 30 === 0) return `${days / 30} month${days === 30 ? '' : 's'}`;
  if (days % 7 === 0) return `${days / 7} week${days === 7 ? '' : 's'}`;
  return `${days} day${days === 1 ? '' : 's'}`;
}
function labelFor(action: string): string {
  return { 'company-breakthrough': 'new company with a breakthrough', breakthrough: 'technological breakthrough' }[action] ?? action.replace(/-/g, ' ');
}
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

export function findCountries(world: World, lower: string): Country[] {
  const out: { c: Country; idx: number }[] = [];
  for (const c of Object.values(world.countries)) {
    const names = [c.name.toLowerCase(), c.adjective.toLowerCase()];
    for (const n of names) { const idx = lower.indexOf(n); if (idx >= 0) { out.push({ c, idx }); break; } }
  }
  return out.sort((a, b) => a.idx - b.idx).map((o) => o.c).filter((c, i, arr) => arr.indexOf(c) === i);
}
export function findRegions(world: World, lower: string): Region[] {
  const out: { r: Region; idx: number }[] = [];
  for (const r of Object.values(world.regions ?? {})) { const idx = lower.indexOf(r.name.toLowerCase()); if (idx >= 0) out.push({ r, idx }); }
  return out.sort((a, b) => a.idx - b.idx || b.r.name.length - a.r.name.length).map((o) => o.r);
}
export function findCompanies(world: World, lower: string): Company[] {
  const out: { c: Company; idx: number }[] = [];
  for (const c of Object.values(world.companies)) {
    if (!c.alive) continue;
    const idx = lower.indexOf(c.name.toLowerCase());
    if (idx >= 0) out.push({ c, idx });
    else if (c.ticker.length >= 3 && new RegExp(`\\b${c.ticker.toLowerCase()}\\b`).test(lower)) out.push({ c, idx: 999 });
  }
  return out.sort((a, b) => a.idx - b.idx).map((o) => o.c);
}
export function findPeople(world: World, lower: string): Person[] {
  const out: { p: Person; idx: number }[] = [];
  for (const p of Object.values(world.people)) {
    if (!p.alive) continue;
    const idx = lower.indexOf(p.name.toLowerCase());
    if (idx >= 0) out.push({ p, idx });
    else if (p.fame > 40 && p.lastName.length > 4 && new RegExp(`\\b${p.lastName.toLowerCase()}\\b`).test(lower)) out.push({ p, idx: 500 });
  }
  return out.sort((a, b) => a.idx - b.idx).map((o) => o.p);
}
function findSector(lower: string): Sector | undefined {
  for (const s of SECTORS) if (new RegExp(`\\b${s}\\b`).test(lower)) return s;
  for (const [k, v] of Object.entries(SECTOR_KEYWORDS)) if (new RegExp(`\\b${k}\\b`).test(lower)) return v;
  return undefined;
}
function findMagnitude(lower: string): number {
  const m = lower.match(/(\d+)\s*(x|times)\b/);
  if (m) return Math.min(3, 1 + Math.log10(Math.max(1, parseInt(m[1], 10))));
  const words: Record<string, number> = { twenty: 2.3, ten: 2, hundred: 3, thousand: 3, huge: 2, massive: 2.2, enormous: 2.3, revolutionary: 2.3, tiny: 0.6, minor: 0.6, small: 0.8, slight: 0.6, devastating: 2.5, catastrophic: 2.8, world: 1.5, global: 1.8 };
  for (const [k, v] of Object.entries(words)) if (new RegExp(`\\b${k}\\b`).test(lower)) return v;
  return 1;
}
function extractField(lower: string): string | undefined {
  const fields = ['battery', 'fusion', 'quantum computing', 'quantum', 'gene editing', 'artificial intelligence', 'ai', 'superconductor', 'carbon capture', 'desalination', 'neural interface', 'solar', 'rocket', 'engine', 'vaccine', 'cure', 'drug', 'chip', 'robot', 'material', 'reactor', 'energy storage', 'longevity', 'teleportation', 'antigravity', 'nanotech'];
  for (const f of fields) if (lower.includes(f)) return f === 'ai' ? 'artificial intelligence' : f;
  return undefined;
}
function normalizeDisaster(w: string): string { const l = w.toLowerCase(); if (l.startsWith('typhoon') || l.startsWith('storm')) return 'hurricane'; if (l.startsWith('eruption')) return 'volcano'; return l.replace(/s$/, ''); }
function normalizeGov(w: string): string { const l = w.toLowerCase(); if (l === 'dictatorship') return 'autocracy'; if (l === 'junta') return 'military-junta'; return l; }
function normalizeResource(w: string): string { const l = w.toLowerCase(); if (/oil|gas/.test(l)) return 'oil'; if (/gold|lithium|mineral|diamond|deposit|reserve/.test(l)) return 'minerals'; if (/rare/.test(l)) return 'rareEarth'; if (/water/.test(l)) return 'water'; return 'minerals'; }

export const localGodInterpreter = new LocalGodInterpreter();
