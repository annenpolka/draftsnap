import cac from 'cac'

export async function run(argv: string[]): Promise<void> {
  const cli = cac('draftsnap-node')
  cli.help()
  cli.version('0.1.0')
  cli.parse(argv, { run: false })
}
