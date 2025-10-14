import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export function createMockChildProcess(): ChildProcessWithoutNullStreams {
  const listeners: Record<string, Array<(code: number) => void>> = {}
  return {
    stdin: {
      write: () => true,
      end: () => undefined,
    },
    stdout: null as any,
    stderr: null as any,
    on(event: string, handler: (code: number) => void) {
      if (!listeners[event]) {
        listeners[event] = []
      }
      listeners[event]?.push(handler)
      return this
    },
    emit(event: string, code: number) {
      listeners[event]?.forEach((handler) => handler(code))
      return true
    },
  } as unknown as ChildProcessWithoutNullStreams
}
