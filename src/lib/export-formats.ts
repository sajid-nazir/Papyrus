import type { SavedPaper } from '../types'

function bibtexKey(paper: SavedPaper): string {
  const firstAuthor = paper.authors[0]?.split(' ').pop() ?? 'unknown'
  const year = paper.year ?? 'nd'
  const idPart = paper.id.replace(/[^a-zA-Z0-9]/g, '')
  return `${firstAuthor}${year}${idPart}`
}

function bibtexEntry(paper: SavedPaper): string {
  const year = paper.year ?? ''
  const journal = paper.source === 'arxiv'
    ? `arXiv preprint arXiv:${paper.id}`
    : (paper.journal ?? 'Europe PMC')
  const fields = [
    `  title={${paper.title}}`,
    `  author={${paper.authors.join(' and ')}}`,
    `  journal={${journal}}`,
    `  year={${year}}`,
  ]
  if (paper.doi) fields.push(`  doi={${paper.doi}}`)
  return `@article{${bibtexKey(paper)},\n${fields.join(',\n')}\n}`
}

export function toBibtex(papers: SavedPaper[]): string {
  return papers.map(bibtexEntry).join('\n\n')
}

function risEntry(paper: SavedPaper): string {
  const lines = ['TY  - JOUR']
  for (const author of paper.authors) lines.push(`AU  - ${author}`)
  lines.push(`TI  - ${paper.title}`)
  if (paper.year) lines.push(`PY  - ${paper.year}`)
  lines.push(`JO  - ${paper.source === 'arxiv' ? 'arXiv' : (paper.journal ?? 'Europe PMC')}`)
  lines.push(`UR  - ${paper.url}`)
  if (paper.doi) lines.push(`DO  - ${paper.doi}`)
  lines.push('ER  - ')
  return lines.join('\n')
}

export function toRis(papers: SavedPaper[]): string {
  return papers.map(risEntry).join('\n\n')
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(papers: SavedPaper[]): string {
  const header = ['Title', 'Authors', 'Year', 'Journal', 'Source', 'URL', 'DOI']
  const rows = papers.map((p) => [
    p.title,
    p.authors.join('; '),
    p.year?.toString() ?? '',
    p.source === 'arxiv' ? `arXiv:${p.id}` : (p.journal ?? 'Europe PMC'),
    p.source === 'arxiv' ? 'arXiv' : 'Europe PMC',
    p.url,
    p.doi ?? '',
  ])
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n')
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
