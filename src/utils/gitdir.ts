import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { isErrno } from './fs.js'

function parseGitdir(content: string): string | null {
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const lower = line.toLowerCase()
    if (lower.startsWith('gitdir:')) {
      return line.slice('gitdir:'.length).trim()
    }
  }
  return null
}

export async function resolveMainGitDir(workTree: string): Promise<string | null> {
  const dotGit = join(workTree, '.git')

  try {
    const stats = await stat(dotGit)
    if (stats.isDirectory()) {
      return dotGit
    }

    if (stats.isFile()) {
      const content = await readFile(dotGit, 'utf8')
      const gitdir = parseGitdir(content)
      if (!gitdir) {
        throw new Error(`unable to parse gitdir from ${dotGit}`)
      }
      return isAbsolute(gitdir) ? gitdir : resolve(workTree, gitdir)
    }

    return null
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      return null
    }
    throw error
  }
}
