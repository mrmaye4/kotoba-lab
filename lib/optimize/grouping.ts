import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type RuleForGrouping = {
  id: string
  title: string
  description: string | null
  type: string
}

type PreliminaryGroup = {
  name: string
  ruleIds: string[]
  reason: string
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

async function groupChunk(chunk: RuleForGrouping[], languageName: string): Promise<PreliminaryGroup[]> {
  const rulesText = chunk.map((r) =>
    `[${r.id}] ${r.title}${r.description ? ` — ${r.description}` : ''} (type: ${r.type})`
  ).join('\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are analyzing ${languageName} language learning rules. Group the following rules by semantic similarity — rules that overlap, duplicate, or cover the same concept should be grouped together. Return ONLY valid JSON array, no markdown:
[{ "name": "group name", "ruleIds": ["id1", "id2"], "reason": "why grouped" }]
Rules that don't clearly belong with others should be omitted (they will remain ungrouped).
A group must have at least 2 rules.`,
    messages: [{ role: 'user', content: rulesText }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    return []
  }
}

async function consolidateGroups(
  allGroups: PreliminaryGroup[],
  allRules: RuleForGrouping[],
  languageName: string
): Promise<PreliminaryGroup[]> {
  if (allGroups.length === 0) return []

  const groupsText = allGroups.map((g) =>
    `Group "${g.name}" (rules: ${g.ruleIds.join(', ')}): ${g.reason}`
  ).join('\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are consolidating preliminary ${languageName} rule groups that came from different batches. Merge groups that cover the same topic. Keep distinct groups separate. Return ONLY valid JSON array, no markdown:
[{ "name": "group name", "ruleIds": ["id1", "id2", ...], "reason": "why grouped" }]
Include all ruleIds from merged groups. Every ruleId must appear at most once across all groups.`,
    messages: [{ role: 'user', content: groupsText }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    const consolidated: PreliminaryGroup[] = JSON.parse(cleaned)
    const validIds = new Set(allRules.map(r => r.id))
    return consolidated
      .map(g => ({ ...g, ruleIds: g.ruleIds.filter(id => validIds.has(id)) }))
      .filter(g => g.ruleIds.length >= 2)
  } catch {
    return allGroups
  }
}

export async function runGrouping(
  rules: RuleForGrouping[],
  languageName: string
): Promise<PreliminaryGroup[]> {
  const CHUNK_SIZE = 30
  const chunks = chunkArray(rules, CHUNK_SIZE)

  const chunkResults = await Promise.all(
    chunks.map(chunk => groupChunk(chunk, languageName))
  )
  const allPreliminary = chunkResults.flat()

  if (chunks.length === 1) {
    return allPreliminary.filter(g => g.ruleIds.length >= 2)
  }

  return consolidateGroups(allPreliminary, rules, languageName)
}