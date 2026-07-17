const changelogSections = new Set(['Added', 'Changed', 'Fixed', 'Removed'])

function normalizeNewlines(raw) {
  return raw.replace(/\r\n/g, '\n')
}

function updateHtmlCommentState(inHtmlComment, line) {
  let offset = 0

  while (offset < line.length) {
    if (inHtmlComment) {
      const commentEnd = line.indexOf('-->', offset)
      if (commentEnd === -1)
        return true

      inHtmlComment = false
      offset = commentEnd + 3
      continue
    }

    const commentStart = line.indexOf('<!--', offset)
    if (commentStart === -1)
      return false

    inHtmlComment = true
    offset = commentStart + 4
  }

  return inHtmlComment
}

function getFenceStart(line) {
  const match = line.match(/^[ \t]*(`{3,}|~{3,}).*$/)
  if (!match)
    return null

  return {
    marker: match[1][0],
    length: match[1].length,
  }
}

function isFenceEnd(line, fence) {
  const trimmed = line.trim()
  return trimmed.length >= fence.length && [...trimmed].every(character => character === fence.marker)
}

function findLevelTwoHeadings(raw) {
  const normalized = normalizeNewlines(raw)
  const headings = []
  let fence = null
  let inHtmlComment = false
  let offset = 0

  for (const line of normalized.split('\n')) {
    if (fence) {
      if (isFenceEnd(line, fence))
        fence = null
    }
    else if (inHtmlComment) {
      inHtmlComment = updateHtmlCommentState(inHtmlComment, line)
    }
    else {
      const fenceStart = getFenceStart(line)
      if (fenceStart) {
        fence = fenceStart
      }
      else {
        if (/^ {0,3}##[ \t]+\S.*$/.test(line)) {
          headings.push({
            text: line,
            index: offset,
            end: offset + line.length,
          })
        }
        inHtmlComment = updateHtmlCommentState(inHtmlComment, line)
      }
    }

    offset += line.length + 1
  }

  return { normalized, headings }
}

function getSection(raw, heading) {
  const { normalized, headings } = findLevelTwoHeadings(raw)
  const bodyStart = normalized[heading.end] === '\n' ? heading.end + 1 : heading.end
  const nextHeading = headings.find(candidate => candidate.index > heading.index)
  const bodyEnd = nextHeading?.index ?? normalized.length

  return {
    normalized,
    headingStart: heading.index,
    bodyStart,
    bodyEnd,
    body: normalized.slice(bodyStart, bodyEnd).trim(),
  }
}

function parseChangelogItems(body) {
  const items = []
  let currentSection = null
  let currentItem = null
  let fence = null
  let inHtmlComment = false

  function finishItem() {
    if (!currentItem)
      return

    while (currentItem.length > 1 && currentItem.at(-1).trim() === '')
      currentItem.pop()

    items.push({
      category: currentSection,
      value: currentItem.map(line => line.trimEnd()).join('\n'),
    })
    currentItem = null
  }

  function appendToItem(line) {
    if (currentItem)
      currentItem.push(line)
  }

  for (const line of normalizeNewlines(body).split('\n')) {
    if (fence) {
      appendToItem(line)
      if (isFenceEnd(line, fence))
        fence = null
      continue
    }

    if (inHtmlComment) {
      appendToItem(line)
      inHtmlComment = updateHtmlCommentState(inHtmlComment, line)
      continue
    }

    const section = line.match(/^###\s+(.+?)\s*$/)
    if (section) {
      finishItem()
      currentSection = section[1]
      continue
    }

    const item = currentSection ? line.match(/^[-*][ \t]+(\S.*)$/) : null
    if (item) {
      finishItem()
      currentItem = [item[1].trim()]
      inHtmlComment = updateHtmlCommentState(inHtmlComment, line)
      continue
    }

    const fenceStart = getFenceStart(line)
    if (fenceStart) {
      appendToItem(line)
      fence = fenceStart
      continue
    }

    appendToItem(line)
    inHtmlComment = updateHtmlCommentState(inHtmlComment, line)
  }

  finishItem()

  return items
}

export function getChangelogItems(body) {
  return parseChangelogItems(body)
    .filter(item => changelogSections.has(item.category))
    .map(item => item.value)
}

export function getStrictChangelogItems(body, context = 'Changelog section') {
  const items = parseChangelogItems(body)
  const unsupportedCategory = items.find(item => !changelogSections.has(item.category))?.category

  if (unsupportedCategory) {
    throw new Error(
      `${context} contains changelog items under unsupported category "${unsupportedCategory}"; use Added, Changed, Fixed, or Removed`,
    )
  }

  return items.map(item => item.value)
}

function isRealDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return false

  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findReleaseVersionClaims(raw, version) {
  const escapedVersion = escapeRegExp(version)
  const { headings } = findLevelTwoHeadings(raw)
  const claim = new RegExp(`^ {0,3}##[ \\t]+\\[${escapedVersion}\\].*$`)
  return headings.filter(heading => claim.test(heading.text))
}

export function hasReleaseVersionClaim(raw, version) {
  return findReleaseVersionClaims(raw, version).length > 0
}

export function getUnreleasedSection(raw) {
  const { normalized, headings } = findLevelTwoHeadings(raw)
  const claims = headings.filter(heading => heading.text.trim() === '## Unreleased')

  if (claims.length === 0 || claims[0].text !== '## Unreleased')
    throw new Error('CHANGELOG.md must contain an exact ## Unreleased heading')
  if (claims.length > 1)
    throw new Error('CHANGELOG.md must contain exactly one ## Unreleased heading')

  return getSection(normalized, claims[0])
}

export function getUnreleasedItems(raw) {
  return getStrictChangelogItems(getUnreleasedSection(raw).body, 'Unreleased')
}

export function getReleaseNotes(raw, version) {
  const escapedVersion = escapeRegExp(version)
  const heading = `## \\[${escapedVersion}\\]\\(https://github\\.com/theFactoryHQ/factory-careers/releases/tag/v${escapedVersion}\\) \\((\\d{4}-\\d{2}-\\d{2})\\)`
  const normalized = normalizeNewlines(raw)
  const claims = findReleaseVersionClaims(normalized, version)

  if (claims.length > 1)
    throw new Error(`CHANGELOG.md must contain exactly one Factory release section claim for v${version}`)

  const claim = claims[0]
  if (claim) {
    const match = new RegExp(`^${heading}$`).exec(claim.text)
    if (match && isRealDate(match[1]))
      return getSection(normalized, claim).body
  }

  throw new Error(`CHANGELOG.md must contain a matching Factory release section for v${version}`)
}

export function hasChangelogItem(body) {
  return getChangelogItems(normalizeNewlines(body)).length > 0
}
