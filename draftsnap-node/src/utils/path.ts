import { isAbsolute, posix, relative, resolve, sep } from 'node:path'

function toPosixPath(value: string): string {
  return value.split(sep).join(posix.sep)
}

export function sanitizeTargetPath(candidate: string, workTree: string, scratchDir: string): string | null {
  const workRoot = resolve(workTree)
  const scratchRoot = resolve(workRoot, scratchDir)
  const targetAbs = isAbsolute(candidate) ? resolve(candidate) : resolve(workRoot, candidate)

  const rel = relative(scratchRoot, targetAbs)
  if (!rel || rel.startsWith('..') || rel === '') {
    return null
  }

  if (rel.split(sep).some(segment => segment === '..' || segment === '')) {
    return null
  }

  return toPosixPath(`${scratchDir}/${rel}`)
}
