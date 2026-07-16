export interface ChangelogEntry {
  title: string
  date: string | null
  version: string | null
  link: string | null
  sections: { heading: string; items: string[] }[]
}

/**
 * Parses the supported CHANGELOG.md headings into entries for the updates UI.
 */
export function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null
  let currentSection: ChangelogEntry['sections'][number] | null = null

  for (const line of raw.split('\n')) {
    const versionHeading = line.match(/^## \[(.+?)]\((.+?)\)\s*\((.+?)\)/)
    const unreleasedHeading = line.match(/^## Unreleased\s*$/)
    const datedHeading = line.match(/^## (\d{4}-\d{2}-\d{2})(?:\s+[—-]\s+(.+))?\s*$/)

    if (versionHeading || unreleasedHeading || datedHeading) {
      if (current) entries.push(current)

      if (versionHeading) {
        current = {
          title: `v${versionHeading[1]}`,
          version: versionHeading[1] ?? null,
          date: versionHeading[3] ?? null,
          link: versionHeading[2] ?? null,
          sections: [],
        }
      }
      else if (unreleasedHeading) {
        current = { title: 'Unreleased', version: null, date: null, link: null, sections: [] }
      }
      else {
        const date = datedHeading?.[1] ?? null
        current = {
          title: datedHeading?.[2]?.trim() || date || '',
          version: null,
          date,
          link: null,
          sections: [],
        }
      }

      currentSection = null
      continue
    }

    const sectionHeading = line.match(/^### (.+)/)
    if (sectionHeading && current) {
      currentSection = { heading: sectionHeading[1] ?? '', items: [] }
      current.sections.push(currentSection)
      continue
    }

    const item = line.match(/^\s*[*-]\s+(.+)/)
    if (item && currentSection) {
      currentSection.items.push(item[1] ?? '')
    }
  }

  if (current) entries.push(current)

  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${entry.title}-${entry.date}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
