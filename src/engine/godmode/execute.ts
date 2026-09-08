/**
 * Executes a God plan against the world and records the intervention.
 */
import { RNG } from '../rng';
import type { World, WorldEvent, Intervention } from '../types';
import { presetById } from './presets';
import type { GodPlan } from './interpreter';
import * as A from '../events/actions';
import { react } from '../events/consequences';
import { nextId } from '../ids';
import { generateNews, generateSocial, updateTrending } from '../simulation/information';
import { tickMarkets } from '../simulation/markets';
import { collectShocks } from '../events/consequences';
import type { Sector } from '../types';

export interface GodResult { ok: boolean; event?: WorldEvent; intervention?: Intervention; message: string; }

export function executePlan(world: World, rng: RNG, plan: GodPlan, rawCommand: string): GodResult {
  const before = world.events.length;
  let ev: WorldEvent | null = null;
  try {
    if (plan.action === 'company-breakthrough') {
      const country = (plan.params.a && world.countries[plan.params.a]) || rng.pickWeighted(Object.values(world.countries), (c) => c.technology);
      const sector = (plan.params.sector as Sector) || 'technology';
      const founded = A.foundCompany(world, rng, country, sector, 'player', true, undefined, plan.params.name, plan.params.field ? `${plan.params.field} technology` : undefined);
      const co = world.companies[founded.actors[0].id];
      ev = A.techBreakthrough(world, rng, co, country, plan.params.field ?? sector, founded.id, true, plan.magnitude ?? 1.5, undefined, plan.customDescription);
      ev.playerIntervention = true;
    } else {
      const preset = presetById(plan.action);
      if (!preset) return { ok: false, message: `Unknown action "${plan.action}".` };
      ev = preset.run(world, rng, plan.params);
      if (ev && plan.customDescription && plan.action !== 'create-company') ev.description = `${plan.customDescription} — ${ev.description}`;
      if (ev && plan.magnitude && plan.magnitude > 1.5 && ev.severity < 5) ev.severity = Math.min(5, ev.severity + 1) as WorldEvent['severity'];
    }
  } catch (err) {
    console.error('[god] execution failed', err);
    return { ok: false, message: 'The intervention failed to take hold. The world resisted.' };
  }
  if (!ev) return { ok: false, message: 'Nothing happened: the intervention had no valid target (e.g. no active war to end).' };
  const produced = world.events.slice(before);
  for (const e of produced) { e.playerIntervention = true; react(world, rng, e); }
  // Immediate world reaction so the player sees consequences right away
  tickMarkets(world, rng, collectShocks(produced));
  generateNews(world, rng, produced);
  generateSocial(world, rng, produced);
  updateTrending(world);
  const intervention: Intervention = { id: nextId(world, 'god'), day: world.day, command: rawCommand, presetId: plan.action, interpretation: plan.interpretation, eventId: ev.id, targets: plan.targets.length ? plan.targets : ev.actors.slice(0, 3) };
  world.interventions.push(intervention);
  world.rngState = rng.state();
  return { ok: true, event: ev, intervention, message: plan.interpretation };
}
