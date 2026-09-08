/**
 * Procedural naming for countries, cities, people, companies and outlets.
 * Uses syllable "language families" so that names within a country feel coherent.
 */
import { RNG } from './rng';

export interface LanguageFamily {
  id: string;
  onsets: string[];
  nuclei: string[];
  codas: string[];
  countrySuffix: string[];
  citySuffix: string[];
  firstM: string[];
  firstF: string[];
  last: string[];
  companyWords: string[];
}

const FAMILIES: LanguageFamily[] = [
  {
    id: 'latin', onsets: ['v', 'm', 'l', 'r', 's', 'c', 'p', 't', 'd', 'b', 'f', 'g', 'n', 'st', 'br', 'tr', 'pl', 'cr'],
    nuclei: ['a', 'e', 'i', 'o', 'u', 'ia', 'io', 'ea', 'au'], codas: ['', '', 'n', 'r', 's', 'l', 'st', 'nt', 'nd'],
    countrySuffix: ['ia', 'ania', 'ora', 'esia', 'ova', 'ena', 'aria', 'ium'], citySuffix: ['a', 'o', 'is', 'ona', 'ento', 'ara', 'ino', 'ella'],
    firstM: ['Marco', 'Luca', 'Tomas', 'Adrian', 'Julian', 'Rafael', 'Mateo', 'Dario', 'Elio', 'Sergio', 'Bruno', 'Paulo', 'Nico', 'Emilio', 'Victor', 'Cesar', 'Lorenzo', 'Aurelio'],
    firstF: ['Lucia', 'Elena', 'Sofia', 'Marina', 'Clara', 'Valeria', 'Ines', 'Aurora', 'Livia', 'Camila', 'Noemi', 'Bianca', 'Serena', 'Alba', 'Irene', 'Vera', 'Delia', 'Rosa'],
    last: ['Varela', 'Moreno', 'Castell', 'Ferrante', 'Delgado', 'Salvi', 'Oliva', 'Marchetti', 'Rivas', 'Navarro', 'Bellini', 'Serrano', 'Vidal', 'Costa', 'Lombardi', 'Pardo', 'Aranda', 'Ruvo', 'Tessari', 'Molina'],
    companyWords: ['Sol', 'Terra', 'Aurum', 'Vela', 'Nova', 'Lumen', 'Corda', 'Astra', 'Vita', 'Orbis'],
  },
  {
    id: 'nordic', onsets: ['h', 'k', 'v', 'sk', 'st', 'br', 'g', 'fr', 'th', 'r', 'n', 'l', 'sv', 'm'],
    nuclei: ['a', 'e', 'i', 'o', 'u', 'ei', 'au', 'ö', 'å'], codas: ['n', 'r', 'l', 'ng', 's', 'g', 'k', 'v', '', ''],
    countrySuffix: ['land', 'mark', 'heim', 'gard', 'vik', 'holm', 'stad'], citySuffix: ['vik', 'holm', 'borg', 'stad', 'fjord', 'berg', 'dal', 'sund'],
    firstM: ['Erik', 'Lars', 'Soren', 'Magnus', 'Anders', 'Bjorn', 'Halvar', 'Nils', 'Torsten', 'Kristof', 'Ivar', 'Stellan', 'Oskar', 'Rune', 'Leif', 'Henrik'],
    firstF: ['Astrid', 'Freya', 'Ingrid', 'Sigrid', 'Maren', 'Liv', 'Solveig', 'Elin', 'Annika', 'Tove', 'Runa', 'Hilde', 'Kaia', 'Britt', 'Signe', 'Ylva'],
    last: ['Halvorsen', 'Lindqvist', 'Bergstrom', 'Nyström', 'Aalto', 'Solberg', 'Dahl', 'Vinter', 'Eklund', 'Strand', 'Holm', 'Rask', 'Frisk', 'Nordvik', 'Thorsen', 'Kallio'],
    companyWords: ['Nord', 'Fjell', 'Havn', 'Iskald', 'Berg', 'Stein', 'Vind', 'Skog', 'Frost', 'Elv'],
  },
  {
    id: 'east', onsets: ['k', 't', 'r', 'z', 'sh', 'm', 'n', 'y', 'h', 'ts', 'ch', 'd', 's', 'j'],
    nuclei: ['a', 'i', 'u', 'o', 'e', 'ai', 'ei', 'ou'], codas: ['', '', 'n', 'ng', 'k', 'sh'],
    countrySuffix: ['an', 'ara', 'ong', 'eon', 'ashi', 'uri', 'oku'], citySuffix: ['sai', 'kai', 'to', 'jin', 'shan', 'pur', 'won', 'yama', 'ang'],
    firstM: ['Kenji', 'Ravi', 'Jin', 'Tarun', 'Haruto', 'Wei', 'Arjun', 'Daichi', 'Minh', 'Kiran', 'Ren', 'Sanjay', 'Yusuf', 'Bao', 'Takeshi', 'Dev'],
    firstF: ['Mei', 'Priya', 'Yuki', 'Anaya', 'Sora', 'Lin', 'Hana', 'Asha', 'Rin', 'Devi', 'Aiko', 'Kavya', 'Suki', 'Nila', 'Reina', 'Tara'],
    last: ['Tanaka', 'Okoro', 'Zhao', 'Iyer', 'Sato', 'Rahman', 'Nakamura', 'Kapoor', 'Huang', 'Mehta', 'Kobayashi', 'Batra', 'Lin', 'Sharma', 'Ishikawa', 'Chandra'],
    companyWords: ['Kaze', 'Hoshi', 'Ryu', 'Sora', 'Mizu', 'Hikari', 'Taiyo', 'Kumo', 'Shin', 'Ten'],
  },
  {
    id: 'african', onsets: ['k', 'b', 'm', 'n', 'z', 'd', 'l', 'ny', 'mb', 'nd', 't', 'w', 'ch', 'j', 'ng'],
    nuclei: ['a', 'e', 'i', 'o', 'u', 'aa', 'ou'], codas: ['', '', '', 'n', 'm', 'la', 'ni'],
    countrySuffix: ['ana', 'ia', 'awi', 'ola', 'ambi', 'uma', 'anda'], citySuffix: ['bo', 'ma', 'ka', 'ndo', 'ri', 'sa', 'ye', 'goro'],
    firstM: ['Kwame', 'Tendai', 'Sefu', 'Obi', 'Jabari', 'Amara', 'Chidi', 'Zuberi', 'Kofi', 'Baraka', 'Lekan', 'Idris', 'Themba', 'Malik', 'Tariq', 'Nuru'],
    firstF: ['Amina', 'Zola', 'Nia', 'Adaeze', 'Imani', 'Thandi', 'Fola', 'Ayo', 'Chiamaka', 'Zainab', 'Kesi', 'Naledi', 'Sade', 'Layla', 'Efua', 'Makena'],
    last: ['Okafor', 'Mensah', 'Dlamini', 'Abara', 'Nkemelu', 'Chukwu', 'Banda', 'Mwangi', 'Diallo', 'Adeyemi', 'Kamau', 'Sesay', 'Mbeki', 'Osei', 'Kaunda', 'Achebe'],
    companyWords: ['Jua', 'Simba', 'Baraka', 'Nyota', 'Mlima', 'Moto', 'Bahari', 'Umoja', 'Tumaini', 'Zawadi'],
  },
  {
    id: 'anglo', onsets: ['w', 'h', 'b', 'l', 'm', 'r', 'st', 'th', 'gr', 'br', 'k', 'cl', 'd', 'n'],
    nuclei: ['a', 'e', 'i', 'o', 'ea', 'ai', 'ou'], codas: ['n', 'r', 'l', 'm', 's', 'th', 'd', '', ''],
    countrySuffix: ['land', 'shire', 'ton', 'moor', 'wick', 'ford', 'stead'], citySuffix: ['ton', 'ford', 'bury', 'chester', 'port', 'field', 'ham', 'mouth', 'haven'],
    firstM: ['James', 'Oliver', 'Henry', 'Nathan', 'Elliot', 'Marcus', 'Callum', 'Theo', 'Samuel', 'Owen', 'Declan', 'Rory', 'Jasper', 'Miles', 'Graham', 'Felix'],
    firstF: ['Eleanor', 'Charlotte', 'Grace', 'Harriet', 'Imogen', 'Nora', 'Iris', 'Maeve', 'Sylvie', 'Beatrix', 'Fiona', 'Rowan', 'Cora', 'Willa', 'Esme', 'Tessa'],
    last: ['Whitmore', 'Hale', 'Ashford', 'Crane', 'Blackwood', 'Mercer', 'Holloway', 'Fletcher', 'Kingsley', 'Thorne', 'Prescott', 'Radley', 'Sutton', 'Winslow', 'Callahan', 'Drummond'],
    companyWords: ['North', 'Iron', 'Crown', 'Anchor', 'Beacon', 'Harbor', 'Summit', 'Meridian', 'Vantage', 'Keystone'],
  },
  {
    id: 'slavic', onsets: ['v', 'k', 'z', 'm', 'p', 'b', 'd', 'st', 'kr', 'dr', 'vl', 'sl', 'gr', 'r', 'l'],
    nuclei: ['a', 'e', 'i', 'o', 'u', 'ya', 'ie'], codas: ['v', 'n', 'k', 'r', 'l', 'sh', '', ''],
    countrySuffix: ['ia', 'ovia', 'stan', 'grad', 'nia', 'evo', 'ska'], citySuffix: ['grad', 'ovo', 'sk', 'ovsk', 'ica', 'ets', 'nica', 'burg'],
    firstM: ['Dmitri', 'Viktor', 'Milan', 'Bogdan', 'Anton', 'Yaroslav', 'Nikolai', 'Pavel', 'Stefan', 'Ivan', 'Radomir', 'Luka', 'Zoran', 'Andrei', 'Marek', 'Tomasz'],
    firstF: ['Katya', 'Milena', 'Irina', 'Vesna', 'Anya', 'Dana', 'Zora', 'Nadia', 'Olga', 'Jelena', 'Tatiana', 'Ludmila', 'Sasha', 'Ivana', 'Marta', 'Yana'],
    last: ['Volkov', 'Novak', 'Petrova', 'Kovac', 'Sokolov', 'Horvat', 'Marek', 'Zielinski', 'Bogdanov', 'Dragic', 'Kowalski', 'Ivanova', 'Stanek', 'Radic', 'Orlov', 'Melnik'],
    companyWords: ['Zarya', 'Sever', 'Mir', 'Sokol', 'Volna', 'Kremen', 'Iskra', 'Zvezda', 'Grom', 'Veter'],
  },
  {
    id: 'arabic', onsets: ['al', 'k', 'r', 'm', 's', 'h', 'z', 'b', 'd', 'sh', 'kh', 'q', 'n', 'j', 't'],
    nuclei: ['a', 'i', 'u', 'aa', 'ai', 'ou'], codas: ['', 'r', 'n', 'l', 'm', 'd', 'sh', 'b'],
    countrySuffix: ['istan', 'iyah', 'ara', 'abad', 'iya', 'aq', 'ain'], citySuffix: ['abad', 'iyah', 'bar', 'dan', 'sur', 'rah', 'ah', 'zar'],
    firstM: ['Omar', 'Karim', 'Tariq', 'Hassan', 'Rashid', 'Faisal', 'Samir', 'Nabil', 'Zayd', 'Idris', 'Bilal', 'Jamal', 'Yasir', 'Amir', 'Khalid', 'Ziyad'],
    firstF: ['Layla', 'Noor', 'Yasmin', 'Farah', 'Amal', 'Dalia', 'Rania', 'Samira', 'Hana', 'Leila', 'Zahra', 'Maya', 'Nadia', 'Salma', 'Aida', 'Lina'],
    last: ['Haddad', 'Al-Rashid', 'Farouk', 'Nasser', 'Khoury', 'Mansour', 'Saleh', 'Barakat', 'Hamdan', 'Qureshi', 'Rahimi', 'Zaman', 'Aziz', 'Karimi', 'Darwish', 'Sabbagh'],
    companyWords: ['Noor', 'Sahara', 'Qamar', 'Shams', 'Bahr', 'Jabal', 'Nahr', 'Dar', 'Amal', 'Falak'],
  },
];

export function familyById(id: string): LanguageFamily {
  return FAMILIES.find((f) => f.id === id) ?? FAMILIES[0];
}
export function pickFamily(rng: RNG): LanguageFamily { return rng.pick(FAMILIES); }

export function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

function syllable(rng: RNG, f: LanguageFamily, allowCoda = true): string {
  return rng.pick(f.onsets) + rng.pick(f.nuclei) + (allowCoda ? rng.pick(f.codas) : '');
}

export function makeWord(rng: RNG, f: LanguageFamily, syllables = 2): string {
  let w = '';
  for (let i = 0; i < syllables; i++) w += syllable(rng, f, i === syllables - 1 || rng.bool(0.3));
  // collapse awkward doubles
  w = w.replace(/(.)\1{1,}/g, '$1').replace(/([^aeiouöå]{2})[^aeiouöå]+/g, '$1');
  return cap(w);
}

export function countryName(rng: RNG, f: LanguageFamily): { name: string; adjective: string; code: string } {
  let root = makeWord(rng, f, rng.int(1, 2)).toLowerCase();
  const suffix = rng.pick(f.countrySuffix);
  const suffixStartsVowel = /^[aeiou]/.test(suffix);
  // Vowel-initial suffixes attach to a consonant; consonant-initial suffixes attach to a vowel.
  root = suffixStartsVowel ? root.replace(/[aeiouöå]+$/i, '') : root.replace(/[^aeiouöå]+$/i, '');
  if (!root) root = makeWord(rng, f, 1).toLowerCase();
  // limit consonant clusters at the join
  root = root.replace(/([^aeiouöå])[^aeiouöå]+$/i, '$1');
  let name = cap(root + suffix);
  if (name.length < 5) name = cap(makeWord(rng, f, 2).toLowerCase() + suffix);
  if (name.length > 11) name = cap(root.slice(0, 5).replace(/[^aeiouöå]+$/i, '') + suffix);
  const adjective = adjectiveOf(name);
  const code = (name.slice(0, 1) + name.replace(/[aeiou]/gi, '').slice(1, 3)).toUpperCase().padEnd(3, name.slice(-1).toUpperCase());
  return { name, adjective, code };
}

export function adjectiveOf(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith('ia')) return cap(n.slice(0, -2) + 'ian');
  if (n.endsWith('land')) return cap(n.slice(0, -4) + 'lander');
  if (n.endsWith('stan')) return cap(n.slice(0, -4) + 'stani');
  if (n.endsWith('a')) return cap(n + 'n');
  if (n.endsWith('o') || n.endsWith('u') || n.endsWith('e')) return cap(n + 'an');
  if (n.endsWith('an')) return cap(n + 'i');
  return cap(n + 'ese');
}

export function cityName(rng: RNG, f: LanguageFamily): string {
  const base = makeWord(rng, f, rng.int(1, 2));
  if (!rng.bool(0.65)) return base;
  const suffix = rng.pick(f.citySuffix);
  let root = base.toLowerCase();
  root = /^[aeiou]/.test(suffix) ? root.replace(/[aeiouöå]+$/i, '') : root.replace(/[^aeiouöå]+$/i, '');
  root = root.replace(/([^aeiouöå])[^aeiouöå]+$/i, '$1');
  if (!root) root = base.toLowerCase();
  return cap(root + suffix);
}

export function personName(rng: RNG, f: LanguageFamily, gender: 'm' | 'f' | 'x'): { first: string; last: string } {
  const pool = gender === 'f' ? f.firstF : gender === 'm' ? f.firstM : rng.bool() ? f.firstM : f.firstF;
  return { first: rng.pick(pool), last: rng.pick(f.last) };
}

const COMPANY_SUFFIX: Record<string, string[]> = {
  energy: ['Energy', 'Power', 'Grid', 'Fuels', 'Volt', 'Dynamics'],
  technology: ['Systems', 'Labs', 'Digital', 'Networks', 'AI', 'Compute', 'Soft'],
  finance: ['Capital', 'Bank', 'Holdings', 'Trust', 'Partners', 'Assets'],
  manufacturing: ['Industries', 'Works', 'Manufacturing', 'Fabrication', 'Motors'],
  agriculture: ['Agro', 'Harvest', 'Farms', 'Foods', 'Grain'],
  defense: ['Defense', 'Arms', 'Tactical', 'Shield', 'Ordnance'],
  media: ['Media', 'Studios', 'Broadcasting', 'Press', 'Entertainment'],
  health: ['Health', 'Medical', 'Care', 'Pharma', 'Clinics'],
  transport: ['Logistics', 'Transit', 'Freight', 'Airlines', 'Rail', 'Shipping'],
  retail: ['Retail', 'Market', 'Stores', 'Trading', 'Goods'],
  mining: ['Mining', 'Minerals', 'Resources', 'Metals', 'Extraction'],
  biotech: ['Bio', 'Genomics', 'Biotech', 'Therapeutics', 'Cell'],
  aerospace: ['Aerospace', 'Orbital', 'Space', 'Aeronautics', 'Rockets'],
  construction: ['Construction', 'Builders', 'Infrastructure', 'Concrete', 'Development'],
};

export function companyName(rng: RNG, f: LanguageFamily, sector: string, founderLast?: string): { name: string; ticker: string } {
  const style = rng.int(0, 3);
  let name: string;
  const sfx = rng.pick(COMPANY_SUFFIX[sector] ?? ['Group']);
  if (style === 0 && founderLast) name = `${founderLast} ${sfx}`;
  else if (style === 1) name = `${rng.pick(f.companyWords)} ${sfx}`;
  else if (style === 2) name = `${makeWord(rng, f, 2)} ${sfx}`;
  else name = `${rng.pick(f.companyWords)}${makeWord(rng, f, 1).toLowerCase()}`;
  const ticker = name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
  return { name, ticker };
}

export function outletName(rng: RNG, f: LanguageFamily, countryName: string, bias: string): string {
  const A = ['The', '', ''];
  const words: Record<string, string[]> = {
    establishment: ['Chronicle', 'Herald', 'Times', 'Gazette', 'Standard', 'Observer'],
    opposition: ['Voice', 'Tribune', 'Independent', 'Free Press', 'Dissent', 'Mirror'],
    sensational: ['Flash', 'Pulse', 'Daily Shock', 'Express', 'Wire', 'Buzz'],
    business: ['Ledger', 'Markets', 'Exchange', 'Capital Review', 'Business Daily', 'Index'],
    international: ['Global Wire', 'World Service', 'Intercontinental', 'Planet Desk', 'Meridian News', 'Atlas Report'],
    independent: ['Signal', 'Lantern', 'Compass', 'Record', 'Dispatch', 'Bulletin'],
    state: ['National Broadcasting', 'State Bulletin', 'Official Gazette', 'Republic Radio', 'People\'s Channel', 'National Voice'],
  };
  const w = rng.pick(words[bias] ?? words.independent);
  if (bias === 'international') return `${w}`;
  if (bias === 'state') return `${countryName} ${w}`;
  const a = rng.pick(A);
  const city = rng.bool(0.5) ? countryName : makeWord(rng, f, 1);
  return `${a ? a + ' ' : ''}${city} ${w}`.trim();
}

export function orgName(rng: RNG, f: LanguageFamily, type: string, country?: string): string {
  const parts: Record<string, string[]> = {
    movement: ['Front', 'Movement', 'Coalition', 'Assembly', 'Alliance', 'Rising', 'Collective'],
    research: ['Institute', 'Laboratory', 'Foundation', 'Academy', 'Research Center', 'Observatory'],
    military: ['Command', 'Guard', 'Legion', 'Defense Force', 'Corps'],
    ngo: ['Relief', 'Aid', 'Watch', 'Initiative', 'Trust', 'Fund'],
    criminal: ['Syndicate', 'Cartel', 'Network', 'Brotherhood', 'Circle', 'Family'],
    religion: ['Church', 'Path', 'Order', 'Fellowship', 'Faith', 'Temple'],
    union: ['Workers Union', 'Federation of Labor', 'Guild', 'Trades Council'],
    alliance: ['Pact', 'Treaty Organization', 'Compact', 'League', 'Accord', 'Union'],
    party: ['Party', 'Democrats', 'Union', 'Bloc', 'Front', 'Alliance'],
  };
  const adj = ['United', 'New', 'Free', 'National', 'Popular', 'Northern', 'Southern', 'Civic', 'Radical', 'Green', 'Open', 'Sovereign', 'Democratic', 'Progressive', 'Traditional', 'Eternal', 'Silent', 'Golden', 'Iron', 'Red', 'Blue', 'Black'];
  const w = rng.pick(parts[type] ?? ['Organization']);
  if (type === 'criminal') return `${rng.pick(['The', ''])} ${makeWord(rng, f, 1)} ${w}`.trim();
  if (type === 'research') return `${makeWord(rng, f, 2)} ${w}`;
  if (rng.bool(0.5) && country) return `${country} ${rng.pick(adj)} ${w}`;
  return `${rng.pick(adj)} ${w} of ${makeWord(rng, f, 2)}`;
}

export function handleFor(first: string, last: string, rng: RNG): string {
  const styles = [
    () => `${first.toLowerCase()}${last.toLowerCase()}`,
    () => `${first.toLowerCase()}_${last.toLowerCase().slice(0, 4)}`,
    () => `${first.slice(0, 1).toLowerCase()}${last.toLowerCase()}${rng.int(1, 99)}`,
    () => `${last.toLowerCase()}.${first.toLowerCase().slice(0, 3)}`,
    () => `real${first.toLowerCase()}`,
    () => `${first.toLowerCase()}${rng.pick(['official', 'hq', 'writes', 'live', 'x'])}`,
  ];
  return rng.pick(styles)().replace(/[^a-z0-9_.]/g, '');
}
