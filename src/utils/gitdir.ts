import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
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

async function resolveGitDirAt(dir: string): Promise<string | null> {
  const dotGit = join(dir, '.git')

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
      return isAbsolute(gitdir) ? gitdir : resolve(dir, gitdir)
    }

    return null
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      return null
    }
    throw error
  }
}

export async function resolveMainGitDir(workTree: string): Promise<string | null> {
  let dir = resolve(workTree)
  const { root } = parse(dir)

  while (true) {
    const result = await resolveGitDirAt(dir)
    if (result) {
      return result
    }
    if (dir === root) {
      return null
    }
    dir = dirname(dir)
  }
}
