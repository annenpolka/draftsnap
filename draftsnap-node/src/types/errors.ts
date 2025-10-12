export enum ExitCode {
  OK = 0,
  NO_CHANGES = 10,
  NOT_INITIALIZED = 11,
  LOCKED = 12,
  PRECONDITION_FAILED = 13,
  INVALID_ARGS = 14
}

export class DraftsnapError extends Error {
  readonly code: ExitCode
  readonly context?: Record<string, unknown>

  constructor(message: string, code: ExitCode, context?: Record<string, unknown>) {
    super(message)
    this.name = 'DraftsnapError'
    this.code = code
    this.context = context
  }
}

export class LockError extends DraftsnapError {
  constructor(message = 'another process holds the lock') {
    super(message, ExitCode.LOCKED)
    this.name = 'LockError'
  }
}

export class InvalidArgsError extends DraftsnapError {
  constructor(message: string) {
    super(message, ExitCode.INVALID_ARGS)
    this.name = 'InvalidArgsError'
  }
}

export class NoChangesError extends DraftsnapError {
  constructor(message = 'no changes to snapshot') {
    super(message, ExitCode.NO_CHANGES)
    this.name = 'NoChangesError'
  }
}

export class NotInitializedError extends DraftsnapError {
  constructor(message = 'sidecar repository not initialized') {
    super(message, ExitCode.NOT_INITIALIZED)
    this.name = 'NotInitializedError'
  }
}
