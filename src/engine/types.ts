/**
 * Core data model for THE WORLD IS ALIVE.
 * Everything here is plain serializable data so that worlds can be saved,
 * exported, and later backed by a real database without changing the engine.
 */

export type ID = string;

export type EntityKind = 'country' | 'city' | 'person' | 'company' | 'organization' | 'outlet' | 'event';

export interface EntityRef { kind: EntityKind; id: ID; }

export type GovernmentType =
  | 'democracy' | 'republic' | 'monarchy' | 'technocracy' | 'autocracy'
  | 'military-junta' | 'theocracy' | 'federation' | 'oligarchy' | 'council';

export type Ideology =
  | 'liberal' | 'conservative' | 'socialist' | 'nationalist' | 'technocratic'
  | 'green' | 'libertarian' | 'populist' | 'traditionalist' | 'progressive';

export type Sector =
  | 'energy' | 'technology' | 'finance' | 'manufacturing' | 'agriculture' | 'defense'
  | 'media' | 'health' | 'transport' | 'retail' | 'mining' | 'biotech' | 'aerospace' | 'construction';

export const SECTORS: Sector[] = ['energy', 'technology', 'finance', 'manufacturing', 'agriculture', 'defense', 'media', 'health', 'transport', 'retail', 'mining', 'biotech', 'aerospace', 'construction'];

export type Profession =
  | 'politician' | 'scientist' | 'journalist' | 'entrepreneur' | 'activist' | 'general'
  | 'celebrity' | 'criminal' | 'artist' | 'executive' | 'diplomat' | 'athlete' | 'engineer' | 'citizen' | 'religious-leader';

export type EventCategory =
  | 'political' | 'economic' | 'corporate' | 'scientific' | 'technological' | 'military'
  | 'environmental' | 'cultural' | 'social' | 'personal' | 'criminal' | 'diplomatic' | 'health';

export const EVENT_CATEGORIES: EventCategory[] = ['political', 'economic', 'corporate', 'scientific', 'technological', 'military', 'environmental', 'cultural', 'social', 'personal', 'criminal', 'diplomatic', 'health'];

/** 1 = minor local, 2 = notable, 3 = national, 4 = major international, 5 = world-changing */
export type Severity = 1 | 2 | 3 | 4 | 5;

export interface Personality {
  ambition: number;     // 0..1
  charisma: number;
  integrity: number;
  aggression: number;
  openness: number;
  caution: number;
}

export interface Relationship {
  target: EntityRef;
  type: 'ally' | 'rival' | 'mentor' | 'family' | 'partner' | 'employer' | 'friend' | 'enemy' | 'funder' | 'member';
  strength: number; // -1..1 affinity
  since: number;    // day index
}

export interface Memory {
  day: number;
  eventId?: ID;
  text: string;
  weight: number; // importance 0..1
}

export interface Person {
  id: ID;
  kind: 'person';
  name: string;
  firstName: string;
  lastName: string;
  gender: 'm' | 'f' | 'x';
  birthDay: number;       // day index (can be negative)
  countryId: ID;
  cityId: ID;
  profession: Profession;
  title?: string;
  influence: number;      // 0..100
  wealth: number;         // in millions
  fame: number;           // 0..100
  reputation: number;     // -100..100 (public sentiment)
  personality: Personality;
  ideology: Ideology;
  traits: string[];
  affiliations: ID[];     // organization / company ids
  relationships: Relationship[];
  memories: Memory[];
  history: { day: number; text: string; eventId?: ID }[];
  objective: string;
  alive: boolean;
  retired: boolean;
  socialHandle: string;
  socialActivity: number; // 0..1 how often they post
  tier: 1 | 2 | 3;        // 1 = deeply simulated named characters, 3 = lightweight
}

export interface City {
  id: ID;
  kind: 'city';
  name: string;
  countryId: ID;
  x: number;              // grid coords (0..W)
  y: number;
  population: number;
  capital: boolean;
  coastal: boolean;
  prosperity: number;     // 0..100
  unrest: number;         // 0..100
  specialties: Sector[];
}

export interface Region {
  id: ID;
  name: string;
  cityIds: ID[];
}

export interface Country {
  id: ID;
  kind: 'country';
  name: string;
  adjective: string;
  code: string;           // 2-3 letters
  color: string;          // hsl base hue for the country palette
  hue: number;
  flag: FlagSpec;
  capitalId: ID;
  cityIds: ID[];
  leaderId: ID;
  government: GovernmentType;
  ideology: Ideology;
  population: number;
  gdp: number;            // billions
  gdpGrowth: number;      // annual %
  inflation: number;      // annual %
  unemployment: number;   // %
  happiness: number;      // 0..100
  stability: number;      // 0..100
  approval: number;       // 0..100 leader approval
  military: number;       // 0..100 relative strength
  technology: number;     // 0..100
  corruption: number;     // 0..100
  freedom: number;        // 0..100 press/civil freedom
  polarization: number;   // 0..100
  unrest: number;         // 0..100
  resources: Record<string, number>; // oil, minerals, farmland, water, rare-earth 0..100
  climateRisk: number;    // 0..100
  debt: number;           // % of GDP
  electionEvery: number;  // years (0 = no elections)
  nextElectionYear: number;
  centroid: { x: number; y: number };
  area: number;           // cells
  neighbors: ID[];        // land borders
  relations: Record<ID, number>; // -100 (war) .. 100 (alliance)
  alliances: ID[];        // allied countries
  atWarWith: ID[];
  tradePartners: ID[];
  movements: ID[];        // organization ids of political movements based here
  founded: number;        // day index (negative = before start)
  culture: { language: string; values: string[]; religionShare: number };
  history: { day: number; text: string; eventId?: ID }[];
}

export interface FlagSpec {
  layout: 'tricolor-v' | 'tricolor-h' | 'bicolor-h' | 'cross' | 'diagonal' | 'canton' | 'emblem' | 'stripes';
  colors: string[];
  emblem?: 'star' | 'circle' | 'diamond' | 'crescent' | 'triangle' | 'ring';
}

export interface Company {
  id: ID;
  kind: 'company';
  name: string;
  ticker: string;
  countryId: ID;
  cityId: ID;
  sector: Sector;
  value: number;          // market cap, billions
  revenue: number;        // billions/year
  employees: number;
  growth: number;         // annualized trend %
  volatility: number;     // 0..1
  reputation: number;     // -100..100
  ceoId: ID;
  founderId?: ID;
  founded: number;
  alive: boolean;
  priceHistory: number[]; // last N days of value (compressed)
  description: string;
  publicListed: boolean;
}

export type OrgType = 'government' | 'movement' | 'research' | 'military' | 'ngo' | 'criminal' | 'religion' | 'union' | 'alliance' | 'party';

export interface Organization {
  id: ID;
  kind: 'organization';
  name: string;
  type: OrgType;
  countryId: ID | null;   // null = international
  leaderId: ID | null;
  memberIds: ID[];
  influence: number;      // 0..100
  support: number;        // 0..100 public support
  ideology?: Ideology;
  agenda: string;
  founded: number;
  alive: boolean;
  history: { day: number; text: string; eventId?: ID }[];
}

export type OutletBias = 'establishment' | 'opposition' | 'sensational' | 'business' | 'international' | 'independent' | 'state';

export interface MediaOutlet {
  id: ID;
  kind: 'outlet';
  name: string;
  countryId: ID | null;
  bias: OutletBias;
  credibility: number;    // 0..100
  audience: number;       // millions
  style: 'broadsheet' | 'tabloid' | 'wire' | 'tv' | 'digital';
  color: string;
  motto: string;
}

export interface NewsArticle {
  id: ID;
  day: number;
  outletId: ID;
  eventId: ID;
  headline: string;
  body: string;
  tone: 'positive' | 'negative' | 'neutral' | 'alarmist';
  reach: number;
}

export interface SocialPost {
  id: ID;
  day: number;
  authorId: ID;
  text: string;
  hashtags: string[];
  likes: number;
  reposts: number;
  replies: number;
  eventId?: ID;
  sentiment: number; // -1..1
  viral: boolean;
  replyTo?: ID;
}

export interface EffectDelta {
  target: EntityRef;
  field: string;
  delta: number;
  note?: string;
}

export interface WorldEvent {
  id: ID;
  kind: 'event';
  day: number;
  category: EventCategory;
  type: string;           // rule identifier e.g. 'war.declared'
  title: string;
  description: string;
  severity: Severity;
  location: { countryId?: ID; cityId?: ID; x: number; y: number };
  actors: EntityRef[];
  causedBy: ID | 'simulation' | 'player';
  consequences: ID[];
  relatedEvents: ID[];
  affectedEntities: EntityRef[];
  effects: EffectDelta[];
  tags: string[];
  mediaRelevance: number; // 0..1
  socialRelevance: number;
  historic: boolean;
  playerIntervention?: boolean;
  data?: Record<string, unknown>;
}

export interface PendingConsequence {
  dueDay: number;
  ruleId: string;
  sourceEventId: ID;
  payload?: Record<string, unknown>;
}

export interface MarketIndex {
  id: ID;
  name: string;
  countryId: ID | null;
  value: number;
  history: number[];
}

export interface Commodity {
  id: ID;
  name: string;
  price: number;
  unit: string;
  history: number[];
  volatility: number;
}

export interface Intervention {
  id: ID;
  day: number;
  command: string;        // raw text or preset id
  presetId?: string;
  interpretation: string; // what the system understood
  eventId: ID;            // the root event produced
  targets: EntityRef[];
}

export interface WorldSummary {
  period: 'day' | 'month' | 'year';
  day: number;
  title: string;
  lines: string[];
}

export interface Geography {
  width: number;
  height: number;
  /** country index per cell (-1 = water). Stored as array for JSON friendliness. */
  cells: number[];
  elevation: number[];    // 0..1
  moisture: number[];
  /** ordered list of country ids matching cell indexes */
  countryOrder: ID[];
}

export interface WorldMeta {
  seed: string;
  name: string;
  createdAt: number;      // real timestamp
  version: number;        // save format version
  startYear: number;
}

export interface World {
  meta: WorldMeta;
  day: number;            // days since start
  countries: Record<ID, Country>;
  cities: Record<ID, City>;
  people: Record<ID, Person>;
  companies: Record<ID, Company>;
  organizations: Record<ID, Organization>;
  outlets: Record<ID, MediaOutlet>;
  events: WorldEvent[];
  news: NewsArticle[];
  social: SocialPost[];
  pending: PendingConsequence[];
  indexes: Record<ID, MarketIndex>;
  commodities: Record<ID, Commodity>;
  interventions: Intervention[];
  summaries: WorldSummary[];
  trending: { tag: string; count: number }[];
  geography: Geography;
  stats: { eventsGenerated: number; ticks: number; lastYearlyDay: number; lastMonthlyDay: number; lastWeeklyDay: number };
  rngState: [number, number, number, number];
  counters: Record<string, number>;
}

export const SAVE_VERSION = 1;
export const DAYS_PER_YEAR = 365;
