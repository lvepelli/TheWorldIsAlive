/**
 * Anniversaries: the world remembers. On the 1st, 5th, 10th, 25th and 50th
 * anniversary of a historic event a small commemoration is recorded, chained
 * to the original so sagas stretch across decades.
 */
import { RNG } from '../rng';
import type { World, WorldEvent } from '../types';
import { createEvent, fx, ref } from '../events/engine';

const MARKS = new Set([1, 10, 25, 50]);

export function anniversaries(world: World, rng: RNG): WorldEvent[] {
  const out: WorldEvent[] = [];
  for (const e of world.events) {
    if (!e.historic || e.type === 'anniversary' || e.type === 'premise.opening') continue;
    if (!['military', 'environmental', 'health', 'scientific', 'political'].includes(e.category) || /scandal|downfall|feud/.test(e.type)) continue;
    if (!(e.severity >= 5 || (e.severity === 4 && e.consequences.length >= 5))) continue; // only the events that mattered
    const age = world.day - e.day;
    if (age < 365 || age % 365 !== 0) continue;
    const years = age / 365;
    if (!MARKS.has(years)) continue;
    const c = e.location.countryId ? world.countries[e.location.countryId] : undefined;
    const grim = /war|disaster|death|assassin|pandemic|epidemic|collapse|coup|crash|purge|scandal|downfall|bankrupt|crackdown|protest|shock|crisis/.test(e.type);
    const leader = c ? world.people[c.leaderId] : undefined;
    const person = e.actors.find((a) => a.kind === 'person'); const who = person ? world.people[person.id] : undefined;
    out.push(createEvent(world, {
      category: 'cultural', type: 'anniversary', severity: years >= 25 ? 2 : 1, causedBy: e.id,
      title: `${years === 1 ? 'One year on' : `${years} years on`}: ${e.title}`,
      description: grim
        ? `${c ? `${c.name} marked` : 'The world marked'} the ${years === 1 ? 'first' : `${years}th`} anniversary with ${rng.pick(['a minute of silence', 'candlelit vigils', 'a state ceremony', 'wreaths at the memorial'])}. ${leader ? `${leader.name} ${rng.pick(['spoke of lessons learned', 'called for unity', 'avoided the subject'])}.` : ''}${who && !who.alive ? ` ${who.name} did not live to see it.` : ''}`
        : `${c ? `${c.name} celebrated` : 'The world celebrated'} ${years === 1 ? 'a year' : `${years} years`} since the day. ${rng.pick(['Documentaries aired all week.', 'A commemorative coin was issued.', 'Schools taught it as history.', 'Veterans of the moment reunited.'])}${who ? ` ${who.name} ${who.alive ? 'gave a rare interview' : 'was remembered'}.` : ''}`,
      location: e.location, actors: e.actors.slice(0, 3), effects: c ? [fx('country', c.id, 'happiness', grim ? -1 : 1)] : [], tags: ['anniversary', 'memory', ...(c ? [c.code] : [])],
    }));
    break; // one commemoration a day is plenty
  }
  return out;
}
