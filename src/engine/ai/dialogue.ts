/**
 * Character dialogue. `CharacterDialogueProvider` answers a player's question
 * in the character's voice. The local implementation composes answers from
 * personality, objective, memories, relationships and current national mood.
 * An LLM implementation can use prompts/character_dialogue.md.
 */
import { RNG } from '../rng';
import type { World, Person } from '../types';
import { ageOf } from '../time';

export interface DialogueProvider {
  readonly id: string;
  answer(world: World, person: Person, question: string): Promise<string> | string;
}

export const SUGGESTED_QUESTIONS = ['What do you want?', 'How do you feel about your country?', 'What happened recently?', 'Who do you trust?', 'What are you afraid of?', 'Tell me about yourself.'];

export class LocalDialogueProvider implements DialogueProvider {
  readonly id = 'local';
  answer(world: World, p: Person, question: string): string {
    const rng = new RNG(`${p.id}:${question}:${world.day}`);
    const c = world.countries[p.countryId];
    const q = question.toLowerCase();
    const voice = (opts: string[]) => rng.pick(opts);
    const tone = p.personality.charisma > 0.6 ? 'warm' : p.personality.caution > 0.6 ? 'guarded' : 'blunt';
    const prefix = tone === 'warm' ? voice(['Ah, a good question. ', 'I am glad you asked. ', '']) : tone === 'guarded' ? voice(['I will choose my words carefully. ', 'Off the record? ', '']) : voice(['Fine. ', 'Straight answer: ', '']);
    if (!p.alive) return voice(['(No answer comes. The dead keep their counsel.)', '(Silence.)']);
    if (/want|goal|objective|ambition|plan/.test(q)) return prefix + voice([`I want to ${p.objective}. Everything else is noise.`, `To ${p.objective}. ${p.personality.ambition > 0.7 ? 'And I will not stop until it is done.' : 'If the world allows it.'}`, `${p.personality.integrity > 0.6 ? 'Honestly?' : 'Officially?'} To ${p.objective}.`]);
    if (/country|nation|government|leader|state|home/.test(q) && c) {
      const leader = world.people[c.leaderId];
      const isLeader = c.leaderId === p.id;
      if (isLeader) return prefix + voice([`${c.name} is ${c.stability > 60 ? 'stable and getting stronger' : c.stability > 35 ? 'holding together, barely' : 'on the edge, and everyone knows it'}. My approval is ${c.approval.toFixed(0)} percent; ${c.approval > 55 ? 'the people are with me' : 'the people are impatient, and so am I'}.`, `I lead ${c.name}. ${c.atWarWith.length ? 'We are at war and I sleep very little.' : 'Peace is our greatest asset and our greatest vulnerability.'}`]);
      const likes = p.ideology === c.ideology;
      return prefix + voice([`${c.name} ${c.happiness > 60 ? 'is a good place to live' : c.happiness > 40 ? 'could be so much more' : 'is suffering'}. As for ${leader?.name ?? 'the leadership'}: ${likes ? 'I support the direction, mostly' : 'I did not vote for this, and I never will'}.`, `${likes ? 'The government understands people like me.' : 'The government has never understood people like me.'} Corruption is ${c.corruption > 60 ? 'everywhere' : c.corruption > 35 ? 'a problem' : 'under control'}, and ${c.unrest > 50 ? 'the streets are angry' : 'the streets are quiet, for now'}.`]);
    }
    if (/recent|happen|news|lately|today/.test(q)) {
      const m = p.memories.slice(-3).reverse();
      if (!m.length) return prefix + voice(['Nothing worth telling. Quiet days, and I distrust quiet days.', 'My life is boring by design.']);
      return prefix + `${m.map((x) => x.text).join('. Then ')}. ${p.personality.openness > 0.5 ? 'I am still processing all of it.' : 'I would rather not dwell on it.'}`;
    }
    if (/trust|friend|ally|enemy|rival|who/.test(q)) {
      const rels = p.relationships.map((r) => ({ r, o: world.people[r.target.id] })).filter((x) => x.o);
      const friends = rels.filter((x) => x.r.strength > 0.3).map((x) => x.o.name);
      const enemies = rels.filter((x) => x.r.strength < -0.3).map((x) => x.o.name);
      const betrayed = rels.filter((x) => x.r.type === 'enemy' && x.r.since < world.day - 30 && x.r.strength < -0.4 && x.o.profession === p.profession).map((x) => x.o.name);
      if (betrayed.length && rng.bool(0.5)) return prefix + `${betrayed[0]} and I used to be on the same side. ${rng.pick(['Not anymore.', 'That ended badly.', 'I will not make that mistake twice.'])}`;
      return prefix + voice([`${friends.length ? `I trust ${friends.slice(0, 2).join(' and ')}.` : 'I trust no one completely.'} ${enemies.length ? `${enemies[0]} would love to see me fail.` : 'Enemies? Give it time.'}`, `${p.personality.caution > 0.5 ? 'Trust is expensive.' : 'Trust is easy, verifying is hard.'} ${friends.length ? `${friends[0]} has never let me down.` : ''} ${enemies.length ? `Keep ${enemies[0]} away from me.` : ''}`.trim()]);
    }
    if (/afraid|fear|worry|scare|risk/.test(q)) return prefix + voice([`${c?.atWarWith.length ? 'The war.' : c && c.unrest > 50 ? 'That the streets will decide what parliament could not.' : 'Irrelevance.'} ${p.personality.caution > 0.5 ? 'I plan for the worst.' : 'But fear is a poor advisor.'}`, `${p.wealth > 100 ? 'Losing everything I built.' : 'Never being able to build anything at all.'} And ${p.personality.integrity < 0.4 ? 'certain files becoming public' : 'letting people down'}.`]);
    if (/yourself|who are you|about you|introduce/.test(q)) return prefix + `I am ${p.name}, ${p.title ? p.title.toLowerCase() + ', ' : ''}${ageOf(p.birthDay, world.day)} years old, ${p.profession.replace('-', ' ')} from ${world.cities[p.cityId]?.name ?? 'nowhere in particular'}. People call me ${p.traits.join(' and ')}. ${p.personality.charisma > 0.6 ? 'They are usually right.' : 'They are usually wrong.'}`;
    if (/money|wealth|rich|pay/.test(q)) return prefix + voice([`${p.wealth > 1000 ? 'More than I can spend, less than I want.' : p.wealth > 10 ? 'Comfortable. Comfort is dangerous.' : 'Enough to eat. Ask me again next year.'}`, `Money is ${p.ideology === 'socialist' ? 'a tool that has become a master' : 'freedom, and freedom is worth having'}.`]);
    // Generic
    return prefix + voice([`${p.traits.includes('cynical') ? 'Everyone asks that, and nobody likes the answer.' : 'That deserves a real answer.'} I think about ${p.objective} most days; the rest is ${rng.pick(['weather', 'politics', 'noise', 'other people\'s problems'])}.`, `${c ? `In ${c.name} we say: ${rng.pick(['patience is a weapon', 'the river does not argue with the stone', 'every empire ends on a Tuesday', 'feed the fire you want to grow'])}.` : 'Hmm.'} Make of that what you will.`, `${p.personality.aggression > 0.6 ? 'Ask a sharper question and you will get a sharper answer.' : 'I am not sure I understand, but I will try.'} Right now I care about one thing: ${p.objective}.`]);
  }
}

export const localDialogue = new LocalDialogueProvider();
