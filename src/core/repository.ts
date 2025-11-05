import type { Dirent } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { resolveMainGitDir } from '../utils/gitdir.js'
import { createGitClient } from './git.js'

interface EnsureSidecarOptions {
  workTree: string
  gitDir: string
  scratchDir: string
}

interface EnsureSidecarResult {
  initialized: boolean
  gitDir: string
  scratchDir: string
  files: string[]
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

async function listFiles(root: string): Promise<string[]> {
  const results: string[] = []

  async function walk(current: string, prefix: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return
      }
      throw error
    }

    for (const entry of entries) {
      const nextPath = join(current, entry.name)
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(nextPath, nextPrefix)
      } else {
        results.push(nextPrefix.replace(/\\/g, '/'))
      }
    }
  }

  await walk(root, '')
  return results.sort()
}

interface EnsureExcludeOptions {
  workTree: string
  scratchDir: string
  gitDir: string
  mainGitDir: string | null
}

async function ensureExclude(options: EnsureExcludeOptions): Promise<void> {
  const { workTree, scratchDir, gitDir, mainGitDir } = options
  if (!mainGitDir) {
    return
  }

  const excludePath = join(mainGitDir, 'info', 'exclude')
  const excludeDir = join(mainGitDir, 'info')
  await mkdir(excludeDir, { recursive: true })

  const gitDirRelative = relative(workTree, gitDir) || gitDir
  const desired = new Set([
    `${scratchDir}/`,
    `${gitDirRelative}${gitDirRelative.endsWith('/') ? '' : '/'}`,
  ])

  let current = ''
  if (await pathExists(excludePath)) {
    current = await readFile(excludePath, 'utf8')
    for (const line of current.split('\n')) {
      if (line.trim()) {
        desired.delete(line.trim())
      }
    }
  }

  if (desired.size === 0) {
    return
  }

  const append = `${Array.from(desired).join('\n')}\n`
  await writeFile(excludePath, current + append)
}

async function ensureSidecarExclude(gitDir: string, scratchDir: string): Promise<void> {
  const excludeDir = join(gitDir, 'info')
  const excludePath = join(excludeDir, 'exclude')
  await mkdir(excludeDir, { recursive: true })

  let current = ''
  const existingLines = new Set<string>()
  if (await pathExists(excludePath)) {
    current = await readFile(excludePath, 'utf8')
    for (const line of current.split('\n')) {
      if (line.trim()) {
        existingLines.add(line.trim())
      }
    }
  }

  const desired = ['*', `!${scratchDir}/`, `!${scratchDir}/**`]
  const missing = desired.filter((entry) => !existingLines.has(entry))
  if (missing.length === 0) {
    return
  }

  const needsNewline = current.length > 0 && !current.endsWith('\n')
  const suffix = `${missing.join('\n')}\n`
  const content = needsNewline ? `${current}\n${suffix}` : `${current}${suffix}`
  await writeFile(excludePath, content)
}

export async function ensureSidecar(options: EnsureSidecarOptions): Promise<EnsureSidecarResult> {
  const { workTree, gitDir, scratchDir } = options
  const git = createGitClient({ workTree, gitDir })

  let initialized = false
  if (!(await pathExists(join(gitDir, 'HEAD')))) {
    await git.exec(['init', '--quiet'])
    initialized = true
  }

  await mkdir(join(workTree, scratchDir), { recursive: true })
  const mainGitDir = await resolveMainGitDir(workTree)
  await ensureExclude({ workTree, scratchDir, gitDir, mainGitDir })
  await ensureSidecarExclude(gitDir, scratchDir)

  const filesRoot = join(workTree, scratchDir)
  const files = await listFiles(filesRoot)
  const prefixed = files.map((file) => `${scratchDir}/${file}`)

  return {
    initialized,
    gitDir,
    scratchDir,
    files: prefixed,
  }
}
