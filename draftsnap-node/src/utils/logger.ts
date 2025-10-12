export interface LoggerOptions {
  json?: boolean
  quiet?: boolean
  debug?: boolean
}

export interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
  debug(message: string): void
}

export function createLogger(options: LoggerOptions, sink: Logger = defaultLogger): Logger {
  const base = sink
  return {
    info(message: string) {
      if (options.json || options.quiet) {
        return
      }
      base.info(message)
    },
    warn(message: string) {
      if (options.json || options.quiet) {
        return
      }
      base.warn(message)
    },
    error(message: string) {
      base.error(message)
    },
    debug(message: string) {
      if (!options.debug || options.json) {
        return
      }
      base.debug(message)
    }
  }
}

const defaultLogger: Logger = {
  info: message => console.error(message),
  warn: message => console.error(message),
  error: message => console.error(message),
  debug: message => console.error(`[debug] ${message}`)
}
