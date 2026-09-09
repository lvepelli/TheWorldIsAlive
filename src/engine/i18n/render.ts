/**
 * Localized rendering of engine text. Events are generated in English (the engine's templates);
 * for Spanish the UI asks `renderEvent`, which rebuilds a natural Spanish title and a concise
 * description from the event's type, actors and data. Types without a Spanish template fall back
 * to the stored English text, so nothing is ever blank. Coverage is listed at the bottom (tests count it).
 */
import type { World, WorldEvent, Country, Person } from '../types';
import { getLang } from './lang';
import { tidy } from '../text';

export interface Rendered { title: string; description: string; localized: boolean }

const CAT_ES: Record<string, string> = { political: 'Política', economic: 'Economía', military: 'Guerra', diplomatic: 'Diplomacia', social: 'Sociedad', scientific: 'Ciencia', technological: 'Tecnología', religious: 'Religión', cultural: 'Cultura', corporate: 'Empresas', environmental: 'Medio ambiente', personal: 'Personas', criminal: 'Crimen', disaster: 'Desastres', health: 'Salud' };
export function categoryLabel(cat: string): string { return getLang() === 'es' ? (CAT_ES[cat] ?? cat) : cat.charAt(0).toUpperCase() + cat.slice(1); }

const POLICY_ES: Record<string, string> = { 'tax cut': 'una rebaja de impuestos', 'infrastructure program': 'un plan de infraestructuras', 'security law': 'una ley de seguridad', 'press regulation': 'una ley de prensa', 'green transition plan': 'un plan de transición verde', 'military modernization': 'la modernización del ejército', 'anti-corruption drive': 'una campaña anticorrupción', 'welfare expansion': 'una ampliación del estado del bienestar', 'irrigation program': 'un plan de regadío', 'agritech subsidy': 'subvenciones agrotecnológicas', 'coastal defence program': 'un plan de defensa costera', 'regional development fund': 'un fondo de desarrollo regional', 'devolution act': 'una ley de autonomía regional' };
const DISASTER_ES: Record<string, [string, string]> = { hurricane: ['Un huracán', 'arrasa'], flood: ['Una riada', 'inunda'], wildfire: ['Un incendio', 'devora'], drought: ['Una sequía', 'castiga'], earthquake: ['Un terremoto', 'sacude'], volcano: ['Una erupción', 'cubre de ceniza'], tsunami: ['Un tsunami', 'golpea'], meteor: ['Un meteorito', 'cae sobre'] };

type Ctx = { w: World; ev: WorldEvent; c: (i?: number) => string; p: (i?: number) => string; co: (i?: number) => string; o: (i?: number) => string; region: string; city: string; country?: Country; person?: Person; d: Record<string, unknown>; sev: number };
type Tpl = (x: Ctx) => [string, string] | null;

const T: Record<string, Tpl> = {
  'war.declared': (x) => [`${x.c(0)} declara la guerra a ${x.c(1)}`, `${x.c(0)} ha declarado la guerra a ${x.c(1)}. Las fronteras se cierran, los mercados caen y los vecinos toman posiciones.`],
  'war.ended': (x) => { const w = x.d.winner ? name(x.w, 'country', x.d.winner as string) : ''; const l = x.d.loser ? name(x.w, 'country', x.d.loser as string) : ''; return w ? [`${w} se impone y termina la guerra con ${l}`, `Tras una campaña brutal, ${l} acepta los términos. ${w} sale reforzado, pero el coste humano ha sido enorme en ambos bandos.`] : [`Un alto el fuego pone fin a la guerra entre ${x.c(0)} y ${x.c(1)}`, `Los negociadores han anunciado un alto el fuego. Ninguno de los dos bandos logró sus objetivos; ambos líderes proclamaron la victoria ante los suyos.`]; },
  'battle': (x) => [`Combates entre ${x.c(0)} y ${x.c(1)}`, `Fuertes enfrentamientos en el frente${x.city ? ` cerca de ${x.city}` : ''}. Las bajas se cuentan por miles.`],
  'border.clash': (x) => [`Choque fronterizo mortal entre ${x.c(0)} y ${x.c(1)}`, `Un incidente en la frontera entre ${x.c(0)} y ${x.c(1)} deja varios muertos y una escalada de acusaciones.`],
  'tension.rise': (x) => [`Crece la tensión entre ${x.c(0)} y ${x.c(1)}`, `Las relaciones entre ${x.c(0)} y ${x.c(1)} se deterioran. Retirada de embajadores, maniobras y una prensa que echa leña al fuego.`],
  'tension.fall': (x) => [`${x.c(0)} y ${x.c(1)} rebajan la tensión`, `Un gesto de distensión entre ${x.c(0)} y ${x.c(1)} abre la puerta a nuevas conversaciones.`],
  'military.buildup': (x) => [`${x.c(0)} refuerza su ejército`, `${x.c(0)} anuncia un aumento del gasto militar y nuevas maniobras. Los vecinos toman nota.`],
  'sanctions': (x) => [`${x.c(0)} impone sanciones a ${x.c(1)}`, `${x.c(0)} ha aprobado sanciones económicas contra ${x.c(1)}. El comercio entre ambos se hunde.`],
  'espionage': (x) => [`Escándalo de espionaje entre ${x.c(0)} y ${x.c(1)}`, `Una red de espionaje de ${x.c(1)} ha sido desmantelada en ${x.c(0)}. Expulsiones de diplomáticos y protestas formales.`],
  'cyberattack': (x) => [`Ciberataque en ${x.c(0)}`, `Un ataque informático ha golpeado infraestructuras de ${x.c(0)}. Se investiga su origen.`],
  'leader.election': (x) => [`${x.p(0)} gana las elecciones en ${x.c(0)}`, `${x.p(0)} se impone en las urnas y asume el liderazgo de ${x.c(0)}. Comienza un nuevo ciclo político.`],
  'election.incumbent': (x) => [`${x.p(0)} revalida su mandato en ${x.c(0)}`, `Los votantes de ${x.c(0)} devuelven a ${x.p(0)} al poder. ${x.sev >= 3 ? 'Los observadores cuestionaron el recuento.' : 'La participación fue notable.'}`],
  'election.campaign': (x) => [`Arranca la campaña en ${x.c(0)}`, `${x.c(0)} vota el año que viene. Las primeras encuestas dan ${x.d.poll ? `${Math.round(Number(x.d.poll))} %` : 'ventaja'} a ${x.p(0)}${x.p(1) !== '?' ? `; ${x.p(1)} lidera la oposición` : ''}.`],
  'election.called': (x) => [`${x.c(0)} convoca elecciones`, `El gobierno de ${x.c(0)} ha convocado elecciones. Un país que no votaba irá a las urnas.`],
  'leader.coup': (x) => [`Golpe de Estado en ${x.c(0)}`, `Los militares han tomado el poder en ${x.c(0)}. ${x.p(0)} asume el mando bajo la ley marcial.`],
  'leader.revolution': (x) => [`Revolución en ${x.c(0)}`, `Una revolución derriba al gobierno de ${x.c(0)}. ${x.p(0)} se pone al frente del nuevo régimen.`],
  'leader.resignation': (x) => [`${x.p(0)} dimite en ${x.c(0)}`, `${x.p(0)} ha presentado su dimisión como líder de ${x.c(0)}. Se abre un periodo de incertidumbre.`],
  'leader.succession': (x) => [`${x.p(0)} sucede al frente de ${x.c(0)}`, `${x.p(0)} asume el liderazgo de ${x.c(0)} tras la salida de su predecesor.`],
  'government.collapse': (x) => [`Se hunde el gobierno de ${x.c(0)}`, `El Estado de ${x.c(0)} ha dejado de funcionar. Un consejo interino intenta mantener el orden mientras los vecinos mueven tropas.`],
  'government.reform': (x) => [`${x.c(0)} cambia su forma de gobierno`, `${x.c(0)} ha reformado sus instituciones. El nuevo sistema redefine quién manda y cómo.`],
  'policy': (x) => { const pol = String(x.d.policy ?? ''); const es = POLICY_ES[pol]; return es ? [`${x.c(0)} aprueba ${es}`, `${x.p(0) !== '?' ? x.p(0) : 'El gobierno'} ha firmado ${es}${x.d.region ? ` destinado a ${x.d.region}` : ''}. La oposición promete derogarlo.`] : null; },
  'protest': (x) => [`Protestas en ${x.city || x.c(0)}`, `Miles de personas salen a la calle en ${x.city || x.c(0)}. El gobierno pide calma; la policía, refuerzos.`],
  'protest.mass': (x) => [`Protestas masivas sacuden ${x.c(0)}`, `Cientos de miles se manifiestan en ${x.c(0)}. Es la mayor movilización en años y el gobierno lo sabe.`],
  'crackdown': (x) => [`${x.c(0)} reprime las protestas`, `Las fuerzas de seguridad de ${x.c(0)} han disuelto las protestas con detenciones masivas. Las imágenes dan la vuelta al mundo.`],
  'martial-law': (x) => [`Ley marcial en ${x.c(0)}`, `El gobierno de ${x.c(0)} declara la ley marcial. Toque de queda y tribunales militares.`],
  'strike': (x) => [`Huelga general en ${x.c(0)}`, `Una huelga paraliza sectores clave de ${x.c(0)}. Los sindicatos exigen salarios; el gobierno, paciencia.`],
  'scandal': (x) => [`Escándalo: ${x.p(0)} acusado de corrupción`, `${x.p(0)} se enfrenta a acusaciones graves. Sus rivales huelen sangre; sus aliados guardan silencio.`],
  'scandal.survived': (x) => [`${x.p(0)} sobrevive al escándalo`, `${x.p(0)} resiste la tormenta. La investigación se cierra sin cargos, pero la reputación queda tocada.`],
  'downfall': (x) => [`${x.p(0)} cae en desgracia`, `${x.p(0)} abandona el cargo tras el escándalo. Termina una carrera; empieza otra para quienes esperaban su sitio.`],
  'rival.attack': (x) => [`${x.p(0)} ataca a ${x.p(1)}`, `${x.p(0)} carga públicamente contra ${x.p(1)}: «tiene que irse». La rivalidad sube de tono.`],
  'rival.ascends': (x) => [`${x.p(0)} ocupa el hueco de ${x.p(1)}`, `Con ${x.p(1)} fuera de juego, ${x.p(0)} asciende y se lleva el crédito.`],
  'ally.rally': (x) => [`${x.p(0)} sale en defensa de ${x.p(1)}`, `${x.p(0)} da la cara por ${x.p(1)} en su peor momento. Lealtades que se recuerdan.`],
  'feud': (x) => [`Enemistad abierta entre ${x.p(0)} y ${x.p(1)}`, `Lo que era rivalidad se vuelve enemistad declarada entre ${x.p(0)} y ${x.p(1)}.`],
  'opposition.attack': (x) => [`${x.p(0)} exige la dimisión del gobierno de ${x.c(0)}`, `${x.p(0)} lidera la ofensiva contra un gobierno con la aprobación por los suelos.`],
  'opposition.leader': (x) => [`${x.p(0)} lidera la oposición en ${x.c(0)}`, `${x.p(0)} se consolida como la voz de la oposición en ${x.c(0)}.`],
  'movement.founded': (x) => [`Nace ${x.o(0)} en ${x.c(0)}`, `Un nuevo movimiento, ${x.o(0)}, irrumpe en ${x.c(0)} con una demanda clara y una calle dispuesta a escucharla.`],
  'movement.surge': (x) => [`${x.o(0)} crece en ${x.c(0)}`, `El apoyo a ${x.o(0)} se dispara en ${x.c(0)}. Los partidos tradicionales empiezan a preocuparse.`],
  'movement.merged': (x) => [`${x.o(0)} absorbe a sus rivales en ${x.c(0)}`, `Antes que fundar otro grupo, los activistas de ${x.c(0)} se suman a ${x.o(0)}.`],
  'crime.major': (x) => [`Gran golpe criminal en ${x.city || x.c(0)}`, `Un delito de gran escala sacude ${x.city || x.c(0)}. Las autoridades prometen resultados.`],
  'corruption': (x) => [`Trama de corrupción en ${x.c(0)}`, `Una investigación destapa una red de corrupción en ${x.c(0)}. Hay dimisiones a la vista.`],
  'death.assassination': (x) => [`${x.p(0)} asesinado`, `${x.p(0)} ha sido asesinado. El país contiene la respiración mientras se busca a los responsables.`],
  'death.natural': (x) => [`Muere ${x.p(0)}`, `${x.p(0)} ha fallecido. Su legado ya se discute.`],
  'death.accident': (x) => [`${x.p(0)} muere en un accidente`, `${x.p(0)} ha muerto en un accidente. Conmoción en ${x.c(0)}.`],
  'retirement': (x) => [`${x.p(0)} se retira`, `${x.p(0)} anuncia su retirada de la vida pública.`],
  'birth': (x) => [`Nace la hija de ${x.p(0)}`, `Buenas noticias para ${x.p(0)}: la familia crece.`],
  'person.rise': (x) => [`${x.p(0)} gana influencia en ${x.c(0)}`, `${x.p(0)} se convierte en una de las figuras a seguir en ${x.c(0)}.`],
  'figure.rise': (x) => [`${x.p(0)} irrumpe en la escena de ${x.c(0)}`, `Una nueva figura, ${x.p(0)}, se hace un nombre en ${x.c(0)}.`],
  'tech.breakthrough': (x) => [`${x.co(0) !== '?' ? x.co(0) : x.c(0)} logra un avance tecnológico`, `Un avance en ${x.c(0)} promete cambiar un sector entero. Los rivales corren a copiarlo.`],
  'tech.diffusion': (x) => [`La nueva tecnología se extiende a ${x.c(0)}`, `${x.c(0)} adopta el avance nacido en otro país. La ventaja se acorta.`],
  'tech.strategic': (x) => [`${x.c(0)} declara estratégica una tecnología`, `${x.c(0)} restringe la exportación de una tecnología clave. Comienza una carrera.`],
  'discovery': (x) => [`Descubrimiento científico en ${x.c(0)}`, `Científicos de ${x.c(0)} anuncian un descubrimiento que reescribe una parte del manual.`],
  'space.milestone': (x) => [`${x.c(0)} alcanza un hito espacial`, `${x.c(0)} celebra un hito en el espacio. Miles siguen la transmisión.`],
  'space.program': (x) => [`${x.c(0)} lanza un programa espacial`, `${x.c(0)} anuncia un programa espacial acelerado para no quedarse atrás.`],
  'automation.shock': (x) => [`La automatización sacude el empleo en ${x.c(0)}`, `Miles de empleos desaparecen en ${x.c(0)} bajo la automatización. La política toma nota.`],
  'regulation': (x) => [`${x.c(0)} aprueba una regulación de la IA`, `El parlamento de ${x.c(0)} impone límites a la inteligencia artificial.`],
  'company.founded': (x) => [`Nace ${x.co(0)} en ${x.c(0)}`, `Una nueva empresa, ${x.co(0)}, abre sus puertas en ${x.city || x.c(0)}.`],
  'company.bankrupt': (x) => [`${x.co(0)} quiebra`, `${x.co(0)} se declara en quiebra. Miles de empleos en el aire en ${x.c(0)}.`],
  'company.pivot': (x) => [`${x.co(0)} cambia de rumbo`, `${x.co(0)} reorienta su negocio hacia un nuevo sector.`],
  'corporate.pivot': (x) => [`${x.co(0)} cambia de rumbo`, `${x.co(0)} reorienta su negocio hacia un nuevo sector.`],
  'merger': (x) => [`${x.co(0)} y ${x.co(1)} se fusionan`, `Nace un gigante: ${x.co(0)} y ${x.co(1)} anuncian su fusión.`],
  'acquisition': (x) => [`${x.co(0)} compra ${x.co(1)}`, `${x.co(0)} adquiere ${x.co(1)}. El regulador estudia la operación.`],
  'partnership': (x) => [`${x.co(0)} y ${x.co(1)} firman una alianza`, `${x.co(0)} y ${x.co(1)} anuncian un acuerdo de colaboración.`],
  'product.launch': (x) => [`${x.co(0)} lanza un nuevo producto`, `${x.co(0)} presenta un producto que sus rivales ya intentan igualar.`],
  'product.failure': (x) => [`Fracasa el lanzamiento de ${x.co(0)}`, `El nuevo producto de ${x.co(0)} decepciona. Las acciones caen.`],
  'startup.success': (x) => [`${x.co(0)} triunfa`, `La joven ${x.co(0)} se convierte en el éxito del año en ${x.c(0)}.`],
  'ceo.change': (x) => [`${x.co(0)} cambia de consejero delegado`, `${x.p(0)} toma las riendas de ${x.co(0)}.`],
  'investment': (x) => [`Gran inversión en ${x.c(0)}`, `Una inversión de gran tamaño llega a ${x.c(0)}.`],
  'market.reaction': (x) => [`Los mercados reaccionan en ${x.c(0)}`, `La bolsa de ${x.c(0)} se mueve con fuerza tras las últimas noticias.`],
  'economy.crisis': (x) => [`Crisis económica en ${x.c(0)}`, `${x.c(0)} entra en crisis: el crecimiento se hunde, el paro sube y el gobierno busca culpables.`],
  'economy.crash': (x) => [`Crac bursátil en ${x.c(0)}`, `La bolsa de ${x.c(0)} se desploma. Pánico entre los inversores.`],
  'economy.boom': (x) => [`Bonanza económica en ${x.c(0)}`, `${x.c(0)} vive un auge económico. El empleo crece y el gobierno se apunta el tanto.`],
  'food.crisis': (x) => [`Crisis alimentaria`, `El precio del grano se dispara y los países más pobres pasan hambre.`],
  'export.ban': (x) => [`${x.c(0)} prohíbe exportar grano`, `${x.c(0)} cierra sus exportaciones de grano para proteger su mercado. Sus socios protestan.`],
  'harvest.report': () => [`Informe anual de cosechas`, `Las cosechas del año marcan el precio del grano y el ánimo de los agricultores.`],
  'aid': (x) => [`${x.c(0)} envía ayuda a ${x.c(1)}`, `${x.c(0)} despacha ayuda humanitaria a ${x.c(1)}.`],
  'reconstruction': (x) => [`Reconstrucción en ${x.c(0)}`, `Comienza la reconstrucción en ${x.c(0)} tras la catástrofe.`],
  'migration.wave': (x) => [`Ola migratoria hacia ${x.c(0)}`, `Miles de personas cruzan la frontera hacia ${x.c(0)}${x.c(1) !== '?' ? ` desde ${x.c(1)}` : ''}.`],
  'summit': (x) => [`Cumbre en ${x.city || x.c(0)}`, `Líderes de varias naciones se reúnen en ${x.city || x.c(0)}${x.d.topic ? ` para hablar de ${topicEs(String(x.d.topic))}` : ''}.`],
  'summit.accord': (x) => [`Acuerdo en la cumbre de ${x.c(0)}`, `La cumbre termina con un acuerdo${x.d.topic ? ` sobre ${topicEs(String(x.d.topic))}` : ''}. Los firmantes se felicitan; los escépticos esperan.`],
  'summit.collapse': (x) => [`Fracasa la cumbre de ${x.c(0)}`, `Las conversaciones se rompen sin acuerdo. Las relaciones entre los asistentes se resienten.`],
  'recognition': (x) => [`${x.c(0)} reconoce a ${x.c(1)}`, `${x.c(0)} reconoce oficialmente a ${x.c(1)}.`],
  'country.founded': (x) => [`${x.c(0)} declara su independencia de ${x.c(1)}`, `Ha nacido una nación. ${x.c(0)} proclama su independencia de ${x.c(1)}${x.d.region ? ` en el territorio de ${x.d.region}` : ''}.`],
  'region.autonomy': (x) => [`${x.d.region} exige autonomía a ${x.c(0)}`, `La región de ${x.d.region} reclama autogobierno a ${x.c(0)}. ${x.p(0) !== '?' ? `${x.p(0)} encabeza la demanda.` : 'La capital escucha, de momento.'}`],
  'region.concession': (x) => [`${x.c(0)} concede autonomía a ${x.d.region}`, `Una ley de autonomía da a ${x.d.region} su propia asamblea y competencias. Los partidarios de la línea dura hablan del principio del fin.`],
  'region.crackdown': (x) => [`${x.c(0)} envía tropas a ${x.d.region}`, `${x.c(0)} responde a la demanda de autonomía con soldados y detenciones. La región calla, y se enfada.`],
  'region.referendum': (x) => [`${x.c(0)} convoca un referéndum en ${x.d.region}`, `${x.d.region} votará sobre su propio estatus en las próximas semanas.`],
  'region.referendum.yes': (x) => [`${x.d.region} vota por el autogobierno`, `${x.d.yes ? `${Math.round(Number(x.d.yes))} % de síes con una participación del ${Math.round(Number(x.d.turnout))} %` : 'La mayoría'}: ${x.d.region} elige el autogobierno y ${x.c(0)} promete cumplir.`],
  'region.referendum.no': (x) => [`${x.d.region} vota seguir en ${x.c(0)}`, `${x.d.yes ? `${Math.round(100 - Number(x.d.yes))} % de noes` : 'La mayoría'}: ${x.d.region} se queda. Los independentistas culpan al tiempo.`],
  'region.annexed': (x) => [`${x.c(0)} se anexiona ${x.d.region}`, `${x.d.region} pasa de ${x.c(1)} a ${x.c(0)}. Ciudades, gente y una frontera nueva de la noche a la mañana.`],
  'annex.insurgency': (x) => [`Insurgencia en ${x.d.region}`, `La región anexionada de ${x.d.region} se rebela contra ${x.c(0)}. Toque de queda y sabotajes.`],
  'region.election': (x) => [`${x.p(0)} gana en ${x.d.region}`, `${x.d.region} elige a ${x.p(0)} como gobernador${x.p(1) !== '?' ? `, desbancando a ${x.p(1)}` : ''}.`],
  'region.rally': (x) => [`${x.p(0)} moviliza ${x.d.region}`, `${x.p(0)} llena las calles de ${x.d.region} con una promesa: la región decidirá su futuro.`],
  'referendum.blocked': (x) => [`${x.c(0)} prohíbe el referéndum independentista`, `El gobierno de ${x.c(0)} declara ilegal la consulta separatista.`],
  'festival.film': (x) => [`Festival de cine en ${x.city || x.c(0)}`, `${x.city || x.c(0)} acoge el festival de cine del año. ${x.p(0) !== '?' ? `${x.p(0)} se lleva el premio principal.` : 'La alfombra roja fue más larga que las películas.'}`],
  'festival.banned': (x) => [`${x.c(0)} prohíbe la película premiada`, `Los censores de ${x.c(0)} retiran de las salas la película ganadora.`],
  'festival.rights': (x) => [`${x.co(0)} compra los derechos de la película premiada`, `${x.co(0)} paga una suma récord por la película del festival.`],
  'trade.fair': (x) => [`Se abre la feria comercial de ${x.city || x.c(0)}`, `${x.c(0)} inaugura la feria comercial del año con delegaciones de sus socios.`],
  'fair.venture': (x) => [`${x.co(0)} y ${x.co(1)} crean una empresa conjunta`, `La pareja que dominó la feria firma una empresa conjunta.`],
  'fair.collapse': (x) => [`Se rompe el acuerdo entre ${x.co(0)} y ${x.co(1)}`, `El acuerdo anunciado en la feria se deshace antes de firmarse.`],
  'religion.holiday': (x) => [`Días santos de ${x.o(0)} en ${x.city || x.c(0)}`, `Peregrinos de todo ${x.c(0)} llenan ${x.city || 'la capital'} durante los días santos de ${x.o(0)}.`],
  'religion.holiday.clash': (x) => [`Disturbios en los días santos de ${x.o(0)}`, `La última noche de los días santos de ${x.o(0)} termina en enfrentamientos en ${x.city || x.c(0)}.`],
  'religion.revival': (x) => [`Renace la fe: ${x.o(0)} crece en ${x.c(0)}`, `${x.o(0)} gana fieles en ${x.c(0)}.`],
  'religion.decline': (x) => [`${x.o(0)} pierde fieles en ${x.c(0)}`, `Los templos de ${x.o(0)} se vacían en ${x.c(0)}.`],
  'religion.schism': (x) => [`Cisma en ${x.o(0)}`, `${x.o(0)} se divide. ${x.p(0) !== '?' ? `${x.p(0)} encabeza la escisión.` : ''}`],
  'sermon': (x) => [`${x.p(0)} pronuncia un sermón que sacude ${x.c(0)}`, `Las palabras de ${x.p(0)} desde el púlpito se convierten en asunto político.`],
  'world.games': (x) => [`Juegos Mundiales en ${x.c(0)}`, `Miles de millones siguen los Juegos Mundiales organizados por ${x.c(0)}.`],
  'prize.laurels': (x) => [`Premios Laurel: ${x.p(0)} galardonado`, `${x.p(0)} recibe el Laurel del año en una ceremonia en ${x.c(0)}.`],
  'culture.moment': (x) => [`Fenómeno cultural en ${x.c(0)}`, `Una obra nacida en ${x.c(0)} se convierte en el fenómeno del momento.`],
  'viral': (x) => [`${x.p(0)} se hace viral`, `Un vídeo de ${x.p(0)} da la vuelta al mundo en horas.`],
  'anniversary': (x) => [`Aniversario en ${x.c(0)}`, `${x.c(0)} conmemora un hecho que marcó su historia.`],
  'health.epidemic': (x) => [`Brote epidémico en ${x.c(0)}`, `Un brote se extiende por ${x.c(0)}. Hospitales al límite.`],
  'health.pandemic': () => [`Se declara una pandemia mundial`, `La enfermedad cruza fronteras y continentes. El mundo se encierra.`],
  'outbreak.contained': (x) => [`${x.c(0)} contiene el brote`, `Las autoridades de ${x.c(0)} declaran controlado el brote.`],
  'vaccine': (x) => [`Una vacuna desarrollada en ${x.c(0)}`, `${x.c(0)} anuncia una vacuna eficaz.`],
  'climate.report': () => [`Informe climático anual`, `El informe anual mide el riesgo climático de cada nación.`],
  'sea.rise': (x) => [`${x.c(0)} pierde terreno frente al mar`, `El mar se traga un distrito costero de ${x.c(0)}. Miles de desplazados.`],
  'resource.discovery': (x) => [`Hallazgo de recursos en ${x.c(0)}`, `${x.c(0)} descubre un yacimiento que puede cambiar su economía.`],
  'purge': (x) => [`Purga en ${x.c(0)}`, `El gobierno de ${x.c(0)} aparta a rivales y sospechosos.`],
  'mentor.turns': (x) => [`${x.p(0)} rompe con ${x.p(1)}`, `El mentor se vuelve contra el discípulo: ${x.p(0)} reniega públicamente de ${x.p(1)}.`],
  'mentor.endorsement': (x) => [`${x.p(0)} apoya a ${x.p(1)}`, `${x.p(0)} da su respaldo público a ${x.p(1)}.`],
  'funder.withdraws': (x) => [`${x.p(0)} retira su apoyo a ${x.o(0)}`, `Sin su mecenas, ${x.o(0)} se queda sin fondos.`],
  'donation': (x) => [`${x.p(0)} financia a ${x.o(0)}`, `${x.p(0)} destina una fortuna a ${x.o(0)}.`],
  'concession': (x) => [`El gobierno de ${x.c(0)} cede`, `Ante la presión, el gobierno de ${x.c(0)} hace concesiones.`],
  'opinion.collapse': (x) => [`Se hunde la aprobación en ${x.c(0)}`, `La aprobación del gobierno de ${x.c(0)} cae en picado.`],
  'breakup': (x) => [`${x.p(0)} y ${x.p(1)} rompen`, `La relación entre ${x.p(0)} y ${x.p(1)} ha terminado.`],
  'career.politics': (x) => [`${x.p(0)} da el salto a la política`, `${x.p(0)} anuncia su entrada en política en ${x.c(0)}.`],
  'premise.opening': (x) => [x.ev.title, x.ev.description],
};

function name(w: World, kind: string, id: string): string {
  if (kind === 'country') return w.countries[id]?.name ?? '?';
  if (kind === 'person') return w.people[id]?.name ?? '?';
  if (kind === 'company') return w.companies[id]?.name ?? '?';
  if (kind === 'organization') return w.organizations[id]?.name ?? '?';
  if (kind === 'region') return w.regions?.[id]?.name ?? '?';
  return '?';
}
function topicEs(t: string): string { return ({ 'climate finance': 'financiación climática', 'AI safety': 'seguridad de la IA', 'trade tariffs': 'aranceles', 'nuclear non-proliferation': 'no proliferación nuclear', migration: 'migración', 'a regional security framework': 'un marco de seguridad regional', 'debt relief': 'alivio de la deuda' } as Record<string, string>)[t] ?? t; }

/** Disaster types share one template. */
function disaster(x: Ctx): [string, string] | null {
  const kind = x.ev.type.replace('disaster.', ''); const d = DISASTER_ES[kind]; if (!d) return null;
  const place = x.city || x.c(0);
  return [`${d[0]} ${d[1]} ${place}`, `${d[0]} ha golpeado ${place}. ${x.sev >= 4 ? 'Miles de víctimas y una región entera por reconstruir.' : 'Daños importantes y una respuesta que llega tarde.'}`];
}

export function renderEvent(ev: WorldEvent, w: World): Rendered {
  if (getLang() !== 'es') return { title: ev.title, description: ev.description, localized: false };
  const actors = (kind: string) => ev.actors.filter((a) => a.kind === kind);
  const pick = (kind: string) => (i = 0) => { const a = actors(kind)[i]; return a ? name(w, kind, a.id) : '?'; };
  const d = (ev.data ?? {}) as Record<string, unknown>;
  const countryActor = actors('country')[0]; const personActor = actors('person')[0];
  const x: Ctx = { w, ev, c: pick('country'), p: pick('person'), co: pick('company'), o: pick('organization'), region: String(d.region ?? ''), city: ev.location.cityId ? (w.cities[ev.location.cityId]?.name ?? '') : '', country: countryActor ? w.countries[countryActor.id] : undefined, person: personActor ? w.people[personActor.id] : undefined, d, sev: ev.severity };
  if (!countryActor && ev.location.countryId) x.c = (i = 0) => (i === 0 ? (w.countries[ev.location.countryId!]?.name ?? '?') : '?');
  const tpl = ev.type.startsWith('disaster.') ? disaster : T[ev.type];
  const out = tpl ? tpl(x) : null;
  if (!out || /\?\?|\b\?\b/.test(out[0])) return { title: ev.title, description: ev.description, localized: false };
  return { title: tidy(out[0]), description: tidy(out[1]), localized: true };
}

/** Which event types have a Spanish template (tests assert a minimum). */
export const LOCALIZED_TYPES = [...Object.keys(T), ...Object.keys(DISASTER_ES).map((k) => `disaster.${k}`)];
