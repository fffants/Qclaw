export function resolveStdioForCommand(command: string): ['ignore', 'pipe', 'pipe'] | undefined {
  // util-linux/BSD `script` fails with tcgetattr/ioctl when stdin is a pipe/socket.
  // Force /dev/null stdin for script wrapper in Electron runtime.
  if (command === 'script') {
    return ['ignore', 'pipe', 'pipe']
  }
  return undefined
}
