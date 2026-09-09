/**
 * Spanish → English keyword bridge for the local God Mode interpreter.
 * The interpreter's intent rules are English regexes; instead of duplicating them,
 * Spanish commands are pre-translated word by word (only keywords, never entity names)
 * so "Estalla una guerra entre A y B dentro de tres meses" becomes
 * "starts a war between A and B in three months". Deterministic and side-effect free.
 */
const ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };

const PHRASES: [RegExp, string][] = [
  [/\bel (ano|año) que viene\b/g, 'next year'], [/\bel (proximo|siguiente) (ano|año)\b/g, 'next year'], [/\bla (proxima|siguiente) semana\b/g, 'next week'], [/\bel (proximo|siguiente) mes\b/g, 'next month'],
  [/\bdentro de\b/g, 'in'], [/\bal cabo de\b/g, 'after'], [/\bmanana\b/g, 'tomorrow'], [/\ba partir de\b/g, 'in'],
  [/\bfestival de cine\b/g, 'film festival'], [/\bferia (comercial|de comercio|internacional)\b/g, 'trade fair'], [/\bgolpe de estado\b/g, 'coup'], [/\balto el fuego\b/g, 'ceasefire'], [/\bse enamora(n)? de\b/g, 'falls in love with'],
  [/\bse independiza\b/g, 'declares independence'], [/\bdeclara (la|su) independencia\b/g, 'declares independence'], [/\bconvoca (un )?referendum\b/g, 'holds a referendum'], [/\bconvoca elecciones( anticipadas)?\b/g, 'calls a snap election'],
  [/\bcrisis (economica|financiera)\b/g, 'economic crisis'], [/\bcrisis energetica\b/g, 'energy crisis'], [/\bcae la bolsa\b/g, 'market crash'], [/\bla bolsa se hunde\b/g, 'market crash'], [/\bmilagro economico\b/g, 'economic miracle'],
  [/\bopinion publica\b/g, 'public'], [/\bse vuelve contra\b/g, 'turn against'], [/\bse une (tras|detras de)\b/g, 'rally behind'], [/\bola migratoria\b/g, 'migration wave'], [/\btierras raras\b/g, 'rare earth'],
  [/\bvuelven las lluvias\b/g, 'rains return'], [/\bllueve por fin\b/g, 'rains return'], [/\btermina la sequia\b/g, 'end the drought'], [/\bprohibe (las )?exportaciones de (grano|trigo|cereal|alimentos)\b/g, 'bans grain exports'],
  [/\bsale a la luz\b/g, 'is exposed'], [/\bse descubre que\b/g, 'reveal secret'], [/\bnueva (empresa|compania)\b/g, 'new company'], [/\bfunda (una )?(empresa|compania|startup)\b/g, 'founds a company'],
  [/\bcambia (de|a|su) (gobierno|regimen|sistema) (a|por)?\b/g, 'becomes a'], [/\bse convierte en (una )?\b/g, 'becomes a '], [/\bpasa a ser (una )?\b/g, 'becomes a '],
];

const WORDS: Record<string, string> = {
  guerra: 'war', declara: 'declares', declaran: 'declare', estalla: 'starts', invade: 'invades', invasion: 'invasion', ataca: 'attacks', ataque: 'attack', paz: 'peace', tregua: 'ceasefire', armisticio: 'armistice', termina: 'ends', acaba: 'ends', fin: 'end', detiene: 'stops', cesa: 'ceases',
  alianza: 'alliance', aliados: 'allies', aliado: 'ally', pacto: 'pact', tratado: 'treaty', rompe: 'breaks', rompen: 'break', tension: 'tension', tensiones: 'tension', hostilidad: 'hostility', rival: 'rival', rivales: 'rivals', rivalidad: 'rivalry', sanciones: 'sanctions', sanciona: 'sanctions', reconciliacion: 'reconciliation', reconcilian: 'reconcile', deshielo: 'thaw', normalizan: 'normalise', relaciones: 'relations',
  revolucion: 'revolution', levantamiento: 'uprising', rebelion: 'rebellion', revuelta: 'revolt', derroca: 'overthrow', derrocan: 'overthrow', golpe: 'coup', junta: 'junta', generales: 'generals', gobierno: 'government', regimen: 'regime', estado: 'state', colapsa: 'collapses', colapso: 'collapse', cae: 'falls', caida: 'fall', fracasa: 'fails', hunde: 'collapses',
  anexiona: 'annexes', anexa: 'annexes', anexion: 'annexation', cede: 'cedes', region: 'region', provincia: 'province', autonomia: 'autonomy', autogobierno: 'self-rule', independencia: 'independence', independiente: 'independent', secesion: 'secession', separa: 'secedes', nacion: 'nation', pais: 'country', nuevo: 'new', nueva: 'new',
  democracia: 'democracy', republica: 'republic', monarquia: 'monarchy', tecnocracia: 'technocracy', autocracia: 'autocracy', teocracia: 'theocracy', federacion: 'federation', oligarquia: 'oligarchy', consejo: 'council', dictadura: 'dictatorship',
  movimiento: 'movement', partido: 'party', coalicion: 'coalition', frente: 'front', surge: 'emerges', nace: 'is born', funda: 'founds', fundan: 'found', crea: 'creates', crean: 'create', lanza: 'launches', religion: 'religion', secta: 'cult', fe: 'faith', iglesia: 'church', profeta: 'prophet', culto: 'cult',
  quiebra: 'bankrupt', bancarrota: 'bankrupt', insolvente: 'insolvent', mercado: 'market', mercados: 'market', bolsa: 'stock market', acciones: 'stocks', desploma: 'crashes', desplome: 'crash', hambruna: 'famine', cosecha: 'harvest', cosechas: 'harvests', hambre: 'hunger', escasez: 'shortage', energia: 'energy', combustible: 'fuel', petroleo: 'oil', electricidad: 'electricity', apagon: 'blackout', apagones: 'blackouts', recesion: 'recession', depresion: 'depression', crisis: 'crisis', deuda: 'debt', auge: 'boom', bonanza: 'boom', prosperidad: 'prosperity', prospera: 'thrives', economia: 'economy',
  descubre: 'discovers', descubren: 'discover', descubrimiento: 'discovery', encuentra: 'finds', hallan: 'find', yacimiento: 'deposit', yacimientos: 'reserves', reservas: 'reserves', gas: 'gas', oro: 'gold', litio: 'lithium', minerales: 'minerals', mineral: 'minerals', agua: 'water', diamantes: 'diamond',
  avance: 'breakthrough', inventa: 'invents', inventan: 'invent', desarrolla: 'develops', presenta: 'unveils', logra: 'achieves', construye: 'builds', bateria: 'battery', baterias: 'battery', tecnologia: 'technology', fusion: 'fusion', reactor: 'reactor', motor: 'engine', chip: 'chip', medicamento: 'drug', cura: 'cure', vacuna: 'vaccine', material: 'material', superconductor: 'superconductor', ordenador: 'computer', cohete: 'rocket', dispositivo: 'device', cuantico: 'quantum', cuantica: 'quantum', robot: 'robot', almacena: 'stores', veces: 'times',
  vida: 'life', extraterrestre: 'alien', planeta: 'planet', particula: 'particle', fisica: 'physics', senal: 'signal', civilizacion: 'civilization', especie: 'species', acelera: 'accelerates', aceleran: 'accelerate', progreso: 'progress', ciencia: 'science',
  empresa: 'company', compania: 'company', startup: 'startup', firma: 'firm', corporacion: 'corporation', negocio: 'business', pequena: 'small', pequeno: 'small', gran: 'huge', grande: 'huge', enorme: 'enormous', masivo: 'massive', masiva: 'massive', diminuto: 'tiny', leve: 'slight', devastador: 'devastating', devastadora: 'devastating', catastrofico: 'catastrophic', catastrofica: 'catastrophic', mundial: 'global', global: 'global', historico: 'historic', historica: 'historic',
  asesinan: 'assassinate', asesinado: 'assassinated', asesinato: 'assassination', muere: 'dies', muerte: 'death', desaparece: 'vanishes', desaparicion: 'disappearance', secuestran: 'kidnap', accidente: 'accident',
  referendum: 'referendum', plebiscito: 'plebiscite', elecciones: 'elections', eleccion: 'election', anticipadas: 'snap', urnas: 'polls', vota: 'votes', votan: 'vote', votar: 'vote', libres: 'free',
  amor: 'love', enamora: 'falls in love', enamoran: 'fall in love', boda: 'wedding', casa: 'marries', casan: 'marry', pareja: 'couple', romance: 'romance', enemigos: 'enemies', enemigo: 'enemy', odian: 'hate', pelea: 'feud', enfrentan: 'turn against each other',
  escandalo: 'scandal', corrupcion: 'corruption', corrupto: 'corrupt', soborno: 'bribe', filtracion: 'leak', filtra: 'leaks', expuesto: 'exposed', secreto: 'secret', revela: 'reveals', verdad: 'truth',
  pueblo: 'people', gente: 'people', ciudadanos: 'citizens', poblacion: 'population', apoya: 'support', apoyan: 'support', apoyo: 'support', aprobacion: 'approval', rechaza: 'rejects', rechazan: 'reject', enfadada: 'angry', enfadado: 'angry', une: 'unites', unen: 'unite', sube: 'rises', baja: 'falls', cae_: 'falls',
  migracion: 'migration', migrantes: 'migrants', refugiados: 'refugees', huyen: 'flee', huye: 'flees', exodo: 'exodus', emigran: 'emigrate', desestabiliza: 'destabilizes', caos: 'chaos', anarquia: 'anarchy', disturbios: 'unrest', protesta: 'protest', protestas: 'protests',
  joven: 'young', desconocido: 'unknown', desconocida: 'unknown', lider: 'leader', emprendedor: 'entrepreneur', emprendedora: 'entrepreneur', cientifico: 'scientist', cientifica: 'scientist', artista: 'artist', periodista: 'journalist', activista: 'activist', celebridad: 'celebrity', general: 'general', politico: 'politician', politica: 'politician', estrella: 'star', famoso: 'famous', famosa: 'famous', llamado: 'named', llamada: 'named',
  meteorito: 'meteor', asteroide: 'asteroid', cometa: 'comet', pandemia: 'pandemic', epidemia: 'epidemic', brote: 'outbreak', virus: 'virus', plaga: 'plague', enfermedad: 'disease', terremoto: 'earthquake', inundacion: 'flood', inundaciones: 'flood', huracan: 'hurricane', tifon: 'typhoon', sequia: 'drought', incendio: 'wildfire', incendios: 'wildfire', volcan: 'volcano', erupcion: 'eruption', tsunami: 'tsunami', tormenta: 'storm', lluvia: 'rain', lluvias: 'rains', llueve: 'rains', monzon: 'monsoon', golpea: 'strikes', impacta: 'strikes', azota: 'strikes',
  organiza: 'hosts', acoge: 'hosts', celebra: 'hosts', festival: 'festival', feria: 'fair', alfombra: 'red carpet', cumbre: 'summit',
  sector: 'sector', banco: 'bank', bancos: 'bank', moneda: 'currency', finanzas: 'finance', coche: 'car', coches: 'cars', fabrica: 'factory', acero: 'steel', granja: 'farm', comida: 'food', alimentos: 'food', grano: 'grain', trigo: 'wheat', armas: 'weapons', arma: 'weapon', misil: 'missile', dron: 'drone', defensa: 'defense', militar: 'military', medios: 'media', cine: 'film', pelicula: 'film', noticias: 'news', hospital: 'hospital', medicina: 'medicine', salud: 'health', aerolinea: 'airline', transporte: 'transport', espacio: 'space', satelite: 'satellite', luna: 'moon', tienda: 'shop', mina: 'mine', mineria: 'mining', cobre: 'copper', genetica: 'genetic', genes: 'gene', biotecnologia: 'biotech', cancer: 'cancer', construccion: 'construction', vivienda: 'housing', solar: 'solar', inteligencia: 'artificial', artificial: 'intelligence',
  en: 'in', dentro: 'in', tras: 'after', despues: 'after', proximo: 'next', proxima: 'next', siguiente: 'next', dia: 'day', dias: 'days', semana: 'week', semanas: 'weeks', mes: 'month', meses: 'months', ano: 'year', anos: 'years', decada: 'decade', decadas: 'decades',
  un: 'a', una: 'a', unos: 'some', unas: 'some', el: 'the', la: 'the', los: 'the', las: 'the', de: 'of', del: 'of the', al: 'to the', y: 'and', e: 'and', o: 'or', con: 'with', contra: 'against', entre: 'between', para: 'for', por: 'by', sobre: 'on', hacia: 'towards', desde: 'from', hasta: 'to', que: 'that', se: '', su: 'its', sus: 'its', es: 'is', son: 'are', esta: 'is', estan: 'are', hay: 'there is', tiene: 'has', tienen: 'have', hace: 'makes', hacen: 'make', ser: 'be', muy: 'very', mas: 'more',
  quieres: 'want', quiere: 'wants', deseas: 'want', meta: 'goal', objetivo: 'objective', ambicion: 'ambition', plan: 'plan', region_: 'region', tu: 'your', tus: 'your', ti: 'yourself', opinas: 'feel about', piensas: 'think about', sientes: 'feel about', ultimamente: 'lately', recientemente: 'recently', pasado: 'happened', paso: 'happened', hoy: 'today', confias: 'trust', confianza: 'trust', miedo: 'afraid', temes: 'afraid', hablame: 'tell me about', cuentame: 'tell me about', deberias: 'you should', debes: 'you must', paces: 'peace', vives: 'live', hogar: 'home', vecinos: 'neighbours', casa_: 'home',
  uno: 'one', dos: 'two', tres: 'three', cuatro: 'four', cinco: 'five', seis: 'six', siete: 'seven', ocho: 'eight', nueve: 'nine', diez: 'ten', doce: 'twelve', veinte: 'twenty', cien: 'hundred', mil: 'thousand',
};

const ES_MARKERS = /\b(guerra|dentro de|estalla|pandemia|declara|descubre|empresa|elecciones|referendum|referéndum|escándalo|escandalo|revolución|revolucion|crisis económica|meteorito|terremoto|se enamora|una nueva|un nuevo|independencia|anexiona|autonomía|autonomia|hambruna|golpe de estado|alianza|gobierno|muere|desaparece|colapsa|el año que viene|se convierte en|inventa|migran|refugiados|huyen|festival de cine|feria comercial|cae la bolsa|quieres|deberias|deberías|confias|confías|hablame|háblame|cuentame|cuéntame|opinas|ultimamente|últimamente|tienes miedo|qué ha pasado|que ha pasado|tu región|tu region|tu país|tu pais)\b/i;

function stripAccents(s: string): string { return s.replace(/[áéíóúüñ]/g, (ch) => ACCENTS[ch] ?? ch); }

/** True when the text reads like Spanish (a Spanish keyword appears). Entity names are left untouched either way. */
export function looksSpanish(text: string): boolean { return ES_MARKERS.test(text); }

/**
 * Translate Spanish keywords to their English equivalents so the intent rules can match.
 * Words not in the dictionary (names, places) pass through unchanged; accents are dropped only
 * on translated keywords, so entity names keep their spelling for lookup.
 */
export function spanishToEnglish(text: string, protectNames: string[] = []): string {
  let s = text.toLowerCase();
  // Shield entity names (which may contain dictionary words such as "Nueva") from translation.
  const shields: string[] = [];
  for (const n of protectNames) { const ln = n.toLowerCase(); if (ln.length < 3 || !s.includes(ln)) continue; shields.push(ln); s = s.split(ln).join(`\u0000${shields.length - 1}\u0000`); }
  s = stripAccents(s);
  for (const [re, rep] of PHRASES) s = s.replace(re, rep);
  s = s.replace(/[a-z_]+/g, (w) => (Object.prototype.hasOwnProperty.call(WORDS, w) ? WORDS[w] : w));
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => shields[Number(i)]);
  return s.replace(/\s{2,}/g, ' ').trim();
}
