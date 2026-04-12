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

export function parseVocabulary(content: string, format: 'csv' | 'tsv' | 'auto'): ParsedWord[] {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  // Auto-detect format
  if (format === 'auto') {
    format = lines[0].includes('\t') ? 'tsv' : 'csv'
  }

  const results: ParsedWord[] = []

  for (const line of lines) {
    let fields: string[]

    if (format === 'tsv') {
      fields = line.split('\t')
    } else {
      fields = parseCsvLine(line)
    }

    if (fields.length < 2) continue

    const word = fields[0].trim()
    const translation = fields[1].trim()
    const context = fields[2]?.trim() || undefined

    // Skip header rows
    if (
      word.toLowerCase() === 'word' ||
      word.toLowerCase() === 'term' ||
      word.toLowerCase() === 'front'
    ) continue

    if (word && translation) {
      results.push({ word, translation, context })
    }
  }

  return results
}