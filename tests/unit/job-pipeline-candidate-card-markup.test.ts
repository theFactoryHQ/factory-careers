import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'vue/compiler-sfc'

interface TemplateNode {
  type: number
  tag?: string
  props?: Array<{
    type: number
    name?: string
    arg?: { content?: string }
    exp?: { content?: string }
  }>
  children?: TemplateNode[]
}

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

function findElements(node: TemplateNode, predicate: (node: TemplateNode) => boolean): TemplateNode[] {
  const matches = predicate(node) ? [node] : []

  for (const child of node.children ?? []) {
    matches.push(...findElements(child, predicate))
  }

  return matches
}

describe('job pipeline candidate card markup', () => {
  it('keeps candidate selection and email-copy controls as valid sibling buttons', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const { descriptor, errors } = parse(source, { filename: 'app/pages/dashboard/jobs/[id]/index.vue' })
    const template = descriptor.template?.ast as TemplateNode | undefined

    expect(errors).toEqual([])
    expect(template).toBeDefined()

    const candidateCard = findElements(template!, node =>
      node.tag === 'div'
      && node.props?.some(prop =>
        prop.type === 7
        && prop.name === 'for'
        && prop.exp?.content.includes('filteredApplications'),
      ),
    )[0]

    expect(candidateCard).toBeDefined()

    const copyControls = findElements(candidateCard!, node => node.tag === 'CopyEmailButton')
    const nativeButtons = findElements(candidateCard!, node => node.tag === 'button')
    const buttonContainsCopyControl = nativeButtons.some(button =>
      findElements(button, node => node.tag === 'CopyEmailButton').length > 0,
    )
    const selectionButton = nativeButtons.find(button =>
      button.props?.some(prop =>
        prop.type === 7
        && prop.name === 'bind'
        && prop.arg?.content === 'aria-label'
        && prop.exp?.content.includes('Open candidate'),
      ),
    )

    expect(copyControls).toHaveLength(1)
    expect(buttonContainsCopyControl).toBe(false)
    expect(selectionButton).toBeDefined()
  })
})
