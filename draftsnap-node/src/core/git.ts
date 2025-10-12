import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface GitClientOptions {
  workTree: string
  gitDir: string
}

export interface GitExecOptions {
  input?: string
  cwd?: string
  trim?: boolean
}

export interface GitExecResult {
  stdout: string
  stderr: string
}

export class GitError extends Error {
  readonly args: readonly string[]
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string

  constructor(args: readonly string[], exitCode: number | null, stdout: string, stderr: string) {
    super(`git ${args.join(' ')} (exit code ${exitCode ?? 'unknown'})`)
    this.name = 'GitError'
    this.args = args
    this.exitCode = exitCode
    this.stdout = stdout
    this.stderr = stderr
  }
}

export interface GitClient {
  exec(args: readonly string[], options?: GitExecOptions): Promise<GitExecResult>
}

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024

function stripTrailingNewline(value: string): string {
  if (value.endsWith('\r\n')) {
    return value.slice(0, -2)
  }
  if (value.endsWith('\n')) {
    return value.slice(0, -1)
  }
  return value
}

export function createGitClient({ workTree, gitDir }: GitClientOptions): GitClient {
  return {
    async exec(args, options = {}) {
      const gitArgs = ['--git-dir', gitDir, '--work-tree', workTree, ...args]
      try {
        const { stdout, stderr } = await execFileAsync('git', gitArgs, {
          encoding: 'utf8',
          maxBuffer: DEFAULT_MAX_BUFFER,
          cwd: options.cwd ?? workTree,
          input: options.input,
          env: {
            ...process.env,
            GIT_DIR: gitDir,
            GIT_WORK_TREE: workTree,
          },
        })

        return {
          stdout: (options.trim ?? true) ? stripTrailingNewline(stdout) : stdout,
          stderr: (options.trim ?? true) ? stripTrailingNewline(stderr) : stderr,
        }
      } catch (error) {
        if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
          const execError = error as NodeJS.ErrnoException & {
            stdout: string
            stderr: string
            code: number | null
          }
          const trim = options.trim ?? true
          const stdout = execError.stdout ?? ''
          const stderr = execError.stderr ?? ''
          throw new GitError(
            args,
            typeof execError.code === 'number' ? execError.code : null,
            trim ? stripTrailingNewline(stdout) : stdout,
            trim ? stripTrailingNewline(stderr) : stderr,
          )
        }
        throw error
      }
    },
  }
}
