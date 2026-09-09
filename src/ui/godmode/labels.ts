/**
 * Display-side localization for God Mode presets. The engine keeps English ids/labels
 * (they feed interpretations and saved interventions); the UI shows these instead.
 * Also regroups presets into the player-facing categories of the God Mode screen.
 */
import { getLang } from '@/engine/i18n/lang';
import type { GodPreset, PresetParam } from '@/engine/godmode/presets';
import { t } from '@/i18n';

export type UiGodGroup = 'politics' | 'war' | 'economy' | 'society' | 'technology' | 'environment' | 'companies' | 'people' | 'regions' | 'global';
export const UI_GOD_GROUPS: UiGodGroup[] = ['politics', 'war', 'economy', 'society', 'technology', 'environment', 'companies', 'people', 'regions', 'global'];

const GROUP_OF: Record<string, UiGodGroup> = {
  'start-war': 'war', 'end-war': 'war', 'increase-tension': 'war', 'reduce-tension': 'war', alliance: 'war', 'break-alliance': 'war', destabilize: 'war',
  'change-government': 'politics', 'collapse-government': 'politics', revolution: 'politics', coup: 'politics', movement: 'politics', 'opinion-up': 'politics', 'opinion-down': 'politics', election: 'politics', 'reveal-secret': 'politics',
  boom: 'economy', crisis: 'economy', crash: 'economy', famine: 'economy', 'export-ban': 'economy', 'energy-crisis': 'economy', resource: 'economy', 'trade-fair': 'economy',
  'create-company': 'companies', bankrupt: 'companies', breakthrough: 'companies',
  discovery: 'technology', 'accelerate-tech': 'global',
  disaster: 'environment', meteor: 'environment', epidemic: 'environment', pandemic: 'global', rains: 'environment',
  migration: 'society', religion: 'society', festival: 'society',
  figure: 'people', 'remove-figure': 'people', scandal: 'people', feud: 'people', romance: 'people',
  'create-country': 'regions', annex: 'regions', referendum: 'regions', autonomy: 'regions',
};
export function uiGroupOf(p: GodPreset): UiGodGroup { return GROUP_OF[p.id] ?? 'global'; }
export function uiGroupLabel(g: UiGodGroup | 'all'): string { return t(`god.cat.${g}`); }

const ES: Record<string, { label: string; description: string; params?: Record<string, string> }> = {
  'start-war': { label: 'Declarar guerra', description: 'Obliga a una nación a declarar la guerra a otra.', params: { a: 'Agresor', b: 'Objetivo' } },
  'end-war': { label: 'Terminar guerra', description: 'Impone un alto el fuego en una guerra activa.', params: { a: 'País' } },
  'increase-tension': { label: 'Aumentar tensión', description: 'Envenena las relaciones entre dos países.', params: { a: 'País', b: 'Rival' } },
  'reduce-tension': { label: 'Reducir tensión', description: 'Suaviza la hostilidad entre dos países.', params: { a: 'País', b: 'Otro país' } },
  alliance: { label: 'Forjar alianza', description: 'Une a dos naciones en un pacto de defensa.', params: { a: 'País', b: 'Socio' } },
  'break-alliance': { label: 'Ruptura diplomática', description: 'Destruye una alianza existente.', params: { a: 'País' } },
  destabilize: { label: 'Desestabilizar región', description: 'Disturbios y desconfianza se extienden por un país y sus vecinos.', params: { a: 'Epicentro' } },
  'change-government': { label: 'Cambiar gobierno', description: 'Reescribe la constitución de una nación de la noche a la mañana.', params: { a: 'País', gov: 'Nuevo sistema' } },
  'collapse-government': { label: 'Colapso del gobierno', description: 'El Estado deja de funcionar.', params: { a: 'País' } },
  revolution: { label: 'Desatar revolución', description: 'El pueblo se alza y derroca a sus gobernantes.', params: { a: 'País' } },
  coup: { label: 'Golpe militar', description: 'Los generales toman la capital.', params: { a: 'País' } },
  'create-country': { label: 'Crear país', description: 'Talla una nueva nación a partir de otra existente.', params: { a: 'País de origen', region: 'Región que se separa (opcional, por nombre)', name: 'Nombre (opcional)' } },
  movement: { label: 'Crear movimiento', description: 'Nace un nuevo movimiento político.', params: { a: 'País', name: 'Nombre (opcional)' } },
  'opinion-up': { label: 'Unir a la opinión pública', description: 'La ciudadanía se pone del lado del gobierno.', params: { a: 'País' } },
  'opinion-down': { label: 'Volver a la opinión pública', description: 'La ciudadanía se vuelve contra sus dirigentes.', params: { a: 'País' } },
  'create-company': { label: 'Crear empresa', description: 'Funda una nueva empresa.', params: { a: 'País', sector: 'Sector', name: 'Nombre (opcional)' } },
  bankrupt: { label: 'Quiebra de empresa', description: 'Una empresa se hunde de la noche a la mañana.', params: { co: 'Empresa' } },
  boom: { label: 'Auge económico', description: 'La prosperidad inunda una nación.', params: { a: 'País (vacío = el mundo)' } },
  crisis: { label: 'Crisis económica', description: 'El crédito se seca y los empleos desaparecen.', params: { a: 'País (vacío = el mundo)' } },
  crash: { label: 'Crac bursátil', description: 'Los mercados entran en caída libre.', params: { a: 'País (vacío = global)' } },
  famine: { label: 'Hambruna', description: 'Las cosechas fallan; el precio del grano se dispara y los pobres pasan hambre.', params: { a: 'País más golpeado (vacío = el más pobre)' } },
  rains: { label: 'Vuelven las lluvias', description: 'Rompe una sequía: la lluvia recupera las reservas de agua y alivia el precio del grano.', params: { a: 'País (vacío = el más seco)' } },
  'export-ban': { label: 'Veto a exportar grano', description: 'Un granero del mundo deja de exportar cereal.', params: { a: 'Exportador (vacío = mayor superficie agrícola)' } },
  'energy-crisis': { label: 'Crisis energética', description: 'El combustible y la electricidad escasean.', params: { a: 'País (vacío = el mundo)' } },
  resource: { label: 'Descubrir recursos', description: 'Se hallan reservas inmensas.', params: { a: 'País', res: 'Recurso' } },
  breakthrough: { label: 'Avance tecnológico', description: 'Una tecnología salta una generación.', params: { co: 'Empresa (opcional)', a: 'País', field: 'Campo (p. ej. baterías, fusión)' } },
  discovery: { label: 'Descubrimiento científico', description: 'La ciencia revela algo nuevo sobre la realidad.', params: { a: 'País', what: 'Descubrimiento (opcional)' } },
  'accelerate-tech': { label: 'Acelerar el progreso', description: 'El progreso tecnológico se dispara en todo el mundo.' },
  disaster: { label: 'Desastre natural', description: 'La tierra devuelve el golpe.', params: { a: 'País', kind: 'Tipo' } },
  meteor: { label: 'Impacto de meteorito', description: 'Una roca caída del cielo.', params: { a: 'País' } },
  epidemic: { label: 'Epidemia', description: 'Surge un nuevo patógeno.', params: { a: 'País' } },
  pandemic: { label: 'Pandemia global', description: 'El mundo entero enferma.', params: { a: 'Origen' } },
  migration: { label: 'Ola migratoria', description: 'Millones se ponen en marcha.', params: { a: 'Desde', b: 'Hacia' } },
  religion: { label: 'Crear movimiento religioso', description: 'Una nueva fe echa raíces.', params: { a: 'País', name: 'Nombre (opcional)' } },
  figure: { label: 'Crear figura pública', description: 'Alguien nuevo sale a la luz.', params: { a: 'País', prof: 'Profesión', name: 'Nombre (opcional)' } },
  'remove-figure': { label: 'Eliminar figura pública', description: 'Alguien desaparece de la historia.', params: { p: 'Persona', how: 'Cómo' } },
  scandal: { label: 'Desatar escándalo', description: 'Los esqueletos salen del armario.', params: { p: 'Persona', what: 'Qué (opcional)' } },
  'reveal-secret': { label: 'Revelar secreto', description: 'Una verdad oculta sobre un dirigente sale a la luz.', params: { a: 'País' } },
  annex: { label: 'Anexionar región', description: 'Redibuja el mapa: una nación arrebata una región a un vecino (el más cercano si no se indica).', params: { a: 'Nación anexionadora', b: 'Víctima (vacío = un vecino)', region: 'Región (opcional, por nombre)' } },
  referendum: { label: 'Referéndum regional', description: 'Deja que una región vote su estatus (la más inquieta si no se indica). El resultado depende de su identidad, su autonomía y su ánimo.', params: { a: 'País', region: 'Región (opcional, por nombre)' } },
  autonomy: { label: 'Conceder autonomía', description: 'Transfiere poder a una región inquieta o, si no se indica, a la más agraviada del país.', params: { a: 'País', region: 'Región (opcional, por nombre)' } },
  festival: { label: 'Festival de cine', description: 'Alfombra roja: un festival corona a un artista, y un anfitrión poco libre puede prohibir la película ganadora.', params: { a: 'Anfitrión (vacío = lo decide el mundo)' } },
  'trade-fair': { label: 'Feria comercial', description: 'Una nación recibe a sus socios comerciales; las relaciones mejoran y las empresas punteras pueden formar una alianza.', params: { a: 'Anfitrión (vacío = mayor comerciante)' } },
  election: { label: 'Elecciones anticipadas', description: 'Obliga a un país a votar en semanas, incluso a uno que nunca vota.', params: { a: 'País' } },
  feud: { label: 'Provocar rivalidad', description: 'Convierte a dos personas en rivales acérrimos.', params: { p: 'Persona', p2: 'Rival' } },
  romance: { label: 'Casamentero', description: 'Dos personas se enamoran.', params: { p: 'Persona', p2: 'Pareja' } },
};

const OPTION_ES: Record<string, string> = {
  earthquake: 'terremoto', flood: 'inundación', hurricane: 'huracán', drought: 'sequía', wildfire: 'incendio', volcano: 'volcán', tsunami: 'tsunami',
  disappearance: 'desaparición', accident: 'accidente', assassination: 'asesinato', natural: 'causas naturales',
  oil: 'petróleo', minerals: 'minerales', rareEarth: 'tierras raras', water: 'agua', farmland: 'tierra fértil',
};

export function presetLabel(p: GodPreset): string { return getLang() === 'es' ? ES[p.id]?.label ?? p.label : p.label; }
export function presetDescription(p: GodPreset): string { return getLang() === 'es' ? ES[p.id]?.description ?? p.description : p.description; }
export function paramLabel(p: GodPreset, prm: PresetParam): string { return getLang() === 'es' ? ES[p.id]?.params?.[prm.key] ?? prm.label : prm.label; }
export function optionLabel(prm: PresetParam, o: { value: string; label: string }): string {
  if (getLang() !== 'es') return o.label;
  if (prm.type === 'government') return t(`gov.${o.value}`) === `gov.${o.value}` ? o.label : t(`gov.${o.value}`);
  if (prm.type === 'sector') return t(`sector.${o.value}`) === `sector.${o.value}` ? o.label : t(`sector.${o.value}`);
  if (prm.type === 'profession') return t(`prof.${o.value}`) === `prof.${o.value}` ? o.label : t(`prof.${o.value}`);
  return OPTION_ES[o.value] ?? o.label;
}

const ACTION_ES: Record<string, string> = { 'company-breakthrough': 'nueva empresa con un avance', breakthrough: 'avance tecnológico' };
/** Spanish rendering of a free-text plan: what the interpreter understood, built from the plan itself rather than its English notes. */
export function describePlan(plan: { action: string; params: Record<string, string>; magnitude?: number; delayDays?: number; targets: { kind: string; id: string }[]; interpretation: string }, world: { countries: Record<string, { name: string }>; companies: Record<string, { name: string }>; people: Record<string, { name: string }> }): string {
  if (getLang() !== 'es') return plan.interpretation;
  const preset = GOD_PRESET_LABELS[plan.action] ?? ACTION_ES[plan.action] ?? plan.action.replace(/-/g, ' ');
  const parts: string[] = [`Intención: ${preset}${plan.magnitude && plan.magnitude !== 1 ? ` (magnitud ×${plan.magnitude.toFixed(1)})` : ''}.`];
  if (plan.delayDays) parts.push(`Programado: dentro de ${delayEs(plan.delayDays)}.`);
  const cs = plan.targets.filter((x) => x.kind === 'country').map((x) => world.countries[x.id]?.name).filter(Boolean);
  const cos = plan.targets.filter((x) => x.kind === 'company').map((x) => world.companies[x.id]?.name).filter(Boolean);
  const ps = plan.targets.filter((x) => x.kind === 'person').map((x) => world.people[x.id]?.name).filter(Boolean);
  if (cs.length) parts.push(`${cs.length > 1 ? 'Países' : 'País'}: ${cs.join(', ')}.`);
  if (cos.length) parts.push(`Empresa: ${cos[0]}.`);
  if (ps.length) parts.push(`${ps.length > 1 ? 'Personas' : 'Persona'}: ${ps.slice(0, 2).join(' y ')}.`);
  if (plan.params.sector) parts.push(`Sector: ${t(`sector.${plan.params.sector}`)}.`);
  if (plan.params.region) parts.push(`Región: ${plan.params.region}.`);
  return parts.join(' ');
}
function delayEs(days: number): string {
  if (days % 365 === 0) return `${days / 365} año${days === 365 ? '' : 's'}`;
  if (days % 30 === 0) return `${days / 30} mes${days === 30 ? '' : 'es'}`;
  if (days % 7 === 0) return `${days / 7} semana${days === 7 ? '' : 's'}`;
  return `${days} día${days === 1 ? '' : 's'}`;
}
const GOD_PRESET_LABELS: Record<string, string> = Object.fromEntries(Object.entries(ES).map(([k, v]) => [k, v.label.toLowerCase()]));
