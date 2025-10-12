import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'
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
    if (error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
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
      if (error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
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

async function ensureExclude(workTree: string, scratchDir: string, gitDir: string): Promise<void> {
  const excludePath = join(workTree, '.git', 'info', 'exclude')
  const excludeDir = join(workTree, '.git', 'info')
  await mkdir(excludeDir, { recursive: true })

  const gitDirRelative = relative(workTree, gitDir) || gitDir
  const desired = new Set([`${scratchDir}/`, `${gitDirRelative}${gitDirRelative.endsWith('/') ? '' : '/'}`])

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

  const append = Array.from(desired).join('\n') + '\n'
  await writeFile(excludePath, current + append)
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
  await ensureExclude(workTree, scratchDir, gitDir)

  const filesRoot = join(workTree, scratchDir)
  const files = await listFiles(filesRoot)
  const prefixed = files.map(file => `${scratchDir}/${file}`)

  return {
    initialized,
    gitDir,
    scratchDir,
    files: prefixed
  }
}
