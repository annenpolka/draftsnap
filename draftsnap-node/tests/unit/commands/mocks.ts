import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { PassThrough } from 'node:stream'

export function createMockChildProcess(): ChildProcessWithoutNullStreams {
  const listeners: Record<string, Array<(code: number) => void>> = {}
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()

  const child = {
    stdin,
    stdout,
    stderr,
    on(event: string, handler: (code: number) => void) {
      if (!listeners[event]) {
        listeners[event] = []
      }
      listeners[event].push(handler)
      return child
    },
    emit(event: string, code: number) {
      listeners[event]?.forEach((handler) => {
        handler(code)
      })
      return true
    },
  }

  return child as unknown as ChildProcessWithoutNullStreams
}
