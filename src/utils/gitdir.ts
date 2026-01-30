import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function resolveMainGitDir(workTree: string): Promise<string | null> {
  const cwd = resolve(workTree)
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd,
      encoding: 'utf8',
    })
    return stdout.trimEnd()
  } catch {
    return null
  }
}
