import { z } from 'zod'

export const FACTORY_DIVISIONS = [
  { value: 'factory_capital', label: 'Factory Capital' },
  { value: 'factory_services', label: 'Factory Services' },
  { value: 'factory_partners', label: 'Factory Partners' },
  { value: 'factory_entertainment', label: 'Factory Entertainment' },
  { value: 'factory_cares', label: 'Factory Cares' },
  { value: 'factory_club', label: 'Factory Club' },
] as const

export const FACTORY_DIVISION_VALUES = FACTORY_DIVISIONS.map((division) => division.value) as [
  typeof FACTORY_DIVISIONS[number]['value'],
  ...Array<typeof FACTORY_DIVISIONS[number]['value']>,
]

export type FactoryDivision = typeof FACTORY_DIVISION_VALUES[number]

export const factoryDivisionSchema = z.enum(FACTORY_DIVISION_VALUES)

export type ParagraphJobDescriptionBlock = {
  type: 'paragraph'
  heading?: string
  body: string
}

export type BulletListJobDescriptionBlock = {
  type: 'bullet_list'
  heading: string
  items: string[]
}

export type JobDescriptionBlock = ParagraphJobDescriptionBlock | BulletListJobDescriptionBlock

export const paragraphJobDescriptionBlockSchema = z.object({
  type: z.literal('paragraph'),
  heading: z.string().max(200).optional(),
  body: z.string().max(10000),
})

export const bulletListJobDescriptionBlockSchema = z.object({
  type: z.literal('bullet_list'),
  heading: z.string().max(200),
  items: z.array(z.string().max(500)).max(40),
})

export const jobDescriptionBlockSchema = z.discriminatedUnion('type', [
  paragraphJobDescriptionBlockSchema,
  bulletListJobDescriptionBlockSchema,
])

export const jobDescriptionBlocksSchema = z.array(jobDescriptionBlockSchema).max(40)

function cleanText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
}

export function normalizeJobDescriptionBlocks(blocks: unknown): JobDescriptionBlock[] {
  const parsed = jobDescriptionBlocksSchema.safeParse(blocks ?? [])
  if (!parsed.success) return []

  return parsed.data.flatMap((block): JobDescriptionBlock[] => {
    if (block.type === 'paragraph') {
      const heading = cleanText(block.heading ?? '')
      const body = cleanText(block.body)
      if (!body) return []
      return [heading ? { type: 'paragraph', heading, body } : { type: 'paragraph', body }]
    }

    const heading = cleanText(block.heading)
    const items = block.items.map(cleanText).filter(Boolean)
    return heading && items.length > 0 ? [{ type: 'bullet_list', heading, items }] : []
  })
}

export function jobDescriptionBlocksToMarkdown(blocks: JobDescriptionBlock[]): string {
  return normalizeJobDescriptionBlocks(blocks)
    .flatMap((block) => {
      if (block.type === 'paragraph') return block.heading ? [`### ${block.heading}`, block.body] : [block.body]
      return [`### ${block.heading}`, ...block.items.map((item) => `- ${item}`)]
    })
    .join('\n\n')
}

export function jobDescriptionBlocksToPlainText(blocks: JobDescriptionBlock[]): string {
  return normalizeJobDescriptionBlocks(blocks)
    .flatMap((block) => {
      if (block.type === 'paragraph') return block.heading ? [block.heading, block.body] : [block.body]
      return [block.heading, ...block.items]
    })
    .join('\n')
}

export function legacyDescriptionToBlocks(description?: string | null): JobDescriptionBlock[] {
  const body = cleanText(description ?? '')
  return body ? [{ type: 'paragraph', body }] : []
}

export function formatDivisionLabel(value?: string | null): string {
  return FACTORY_DIVISIONS.find((division) => division.value === value)?.label ?? value ?? ''
}
