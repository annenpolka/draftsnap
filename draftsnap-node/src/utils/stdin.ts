export async function readAllStdin(): Promise<string> {
  const chunks: string[] = []
  return new Promise((resolve, reject) => {
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => chunks.push(chunk))
    process.stdin.on('error', reject)
    process.stdin.on('end', () => resolve(chunks.join('')))
  })
}
