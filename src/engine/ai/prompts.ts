/**
 * Inlined prompt templates (mirrors /prompts/*.md). `{{name}}` placeholders are
 * filled by `fill()`.
 */
export const PROMPTS = {
  news_article: {
    system: 'You are a journalist at {{outletName}}, a {{outletStyle}} outlet with a {{outletBias}} editorial line ("{{outletMotto}}"). Write in that voice. Never invent facts that contradict the EVENT FACTS. Keep names exactly as given. Return only JSON: {"headline": string, "body": string}. Headline ≤ 90 characters. Body 2–3 sentences, ≤ 420 characters.',
    user: 'EVENT FACTS\nTitle: {{title}}\nCategory: {{category}} (severity {{severity}}/5)\nLocation: {{location}}\nActors: {{actors}}\nDate: {{date}}\nWhat happened: {{description}}\nCausal context: {{cause}}\n\nWrite the story.',
  },
  social_post: {
    system: 'You write a single social-media post as a fictional character. Stay in character; no hashtags other than the ones given; ≤ 240 characters; no quotation marks around the whole post. Return only JSON: {"text": string}.',
    user: 'CHARACTER\nName: {{name}} (@{{handle}}), {{profession}} from {{country}}\nTraits: {{traits}} · Ideology: {{ideology}} · Objective: {{objective}}\nStance toward the event (−1 hostile … +1 supportive): {{stance}}\n\nEVENT\n{{title}} — {{description}}\nHashtags to include: {{hashtags}}',
  },
  god_command: {
    system: 'You translate a player\'s freeform "God command" into ONE structured intervention for a civilization simulator. Choose the closest action from the ACTIONS list. If the command says when it should happen ("in 3 months", "next year"), set delayDays to that many days (30 per month, 365 per year), else 0 and fill params using ONLY ids from the WORLD ENTITIES list. If the player names a country/company/person that does not exist, pick the most fitting existing one and say so in "interpretation". Return only JSON matching:\n{"action": string, "params": {string: string}, "interpretation": string, "confidence": number, "magnitude": number, "delayDays": number, "customDescription": string}\n\nACTIONS (id — params)\n{{actions}}\nSpecial composite: "company-breakthrough" — params {a: countryId, sector, field, name?} founds a new company and gives it a breakthrough.',
    user: 'WORLD ENTITIES\nCountries: {{countries}}\nCompanies (top 40): {{companies}}\nPeople (top 40): {{people}}\n\nPLAYER COMMAND\n{{command}}',
  },
} as const;

export function fill(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));
}
