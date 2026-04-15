export type ParsedWord = {
  word: string
  translation: string
  context?: string
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let i = 0

  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let value = ''
      i++ // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          value += '"'
          i += 2
        } else if (line[i] === '"') {
          i++ // skip closing quote
          break
        } else {
          value += line[i++]
        }
      }
      fields.push(value)
      if (line[i] === ',') i++
    } else {
      // Unquoted field
      const end = line.indexOf(',', i)
      if (end === -1) {
        fields.push(line.slice(i))
        break
      } else {
        fields.push(line.slice(i, end))
        i = end + 1
      }
    }
  }

  return fields
}

function stripHtml(str: string): string {
  return str
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

export function parseVocabulary(content: string, format: 'csv' | 'tsv' | 'auto'): ParsedWord[] {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  // Parse Anki metadata comments and apply their settings
  let ankiHtml = false
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('#')) {
      // e.g. "#html:true", "#separator:Tab"
      const m = line.match(/^#(\w+):(.+)$/)
      if (m) {
        const key = m[1].toLowerCase()
        const val = m[2].trim().toLowerCase()
        if (key === 'html') ankiHtml = val === 'true'
        if (key === 'separator') {
          if (val === 'tab' || val === '\t') format = 'tsv'
          else if (val === 'comma' || val === ',') format = 'csv'
        }
      }
      continue
    }
    dataLines.push(line)
  }

  if (dataLines.length === 0) return []

  // Auto-detect format from first data line
  if (format === 'auto') {
    format = dataLines[0].includes('\t') ? 'tsv' : 'csv'
  }

  const results: ParsedWord[] = []

  for (const line of dataLines) {
    let fields: string[]

    if (format === 'tsv') {
      fields = line.split('\t')
    } else {
      fields = parseCsvLine(line)
    }

    if (fields.length < 2) continue

    let word = fields[0].trim()
    let translation = fields[1].trim()
    let context = fields[2]?.trim() || undefined

    // Strip HTML if Anki exported with html:true or if fields look like HTML
    if (ankiHtml || word.includes('<') || translation.includes('<')) {
      word = stripHtml(word)
      translation = stripHtml(translation)
      if (context) context = stripHtml(context)
    }

    // Skip header rows
    if (
      word.toLowerCase() === 'word' ||
      word.toLowerCase() === 'term' ||
      word.toLowerCase() === 'front'
    ) continue

    // Last column in Anki exports is often tags — skip it (already handled by only reading fields 0-2)

    if (word && translation) {
      results.push({ word, translation, context })
    }
  }

  return results
}