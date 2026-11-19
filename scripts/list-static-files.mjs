/**
 * Writes netlify/functions/_staticFiles.json: every file under public/templates and public/articles.
 * A Netlify function cannot list public/ at run time, so the chatbot's file indexer reads this list.
 * Runs before every build (npm "prebuild").
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = new URL('../public/', import.meta.url).pathname
const out = new URL('../netlify/functions/_staticFiles.json', import.meta.url).pathname

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = ['templates', 'articles']
  .flatMap((d) => { try { return walk(join(root, d)) } catch { return [] } })
  .map((f) => relative(root, f).split(sep).join('/'))
  .sort()

writeFileSync(out, `${JSON.stringify(files, null, 2)}\n`)
console.log(`static file list: ${files.length} files`)
