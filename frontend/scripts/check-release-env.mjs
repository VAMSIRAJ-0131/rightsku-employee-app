// Run before a release build (npm run build:release). Reads the API address
// exactly as Vite does for a production build (.env, then .env.production)
// and stops the build unless it is an HTTPS address that is not a local or
// private-network one, so a release never points at a laptop on the Wi-Fi.
import { pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'

export function releaseApiProblem(url) {
  if (!url) return 'VITE_API_BASE_URL is not set. Put the production HTTPS API address in .env.production.'
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return `VITE_API_BASE_URL is not a valid address: ${url}`
  }
  if (parsed.protocol !== 'https:') return `VITE_API_BASE_URL must use https:// for a release, not ${parsed.protocol}//`
  const host = parsed.hostname
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith('.local')) {
    return `VITE_API_BASE_URL points at a local or private-network address (${host}), not the production server.`
  }
  return null
}

// Only when run as a command, not when a test imports releaseApiProblem.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = loadEnv('production', process.cwd(), 'VITE_')
  const problem = releaseApiProblem(env.VITE_API_BASE_URL)
  if (problem) {
    console.error(`Release build stopped: ${problem}`)
    process.exit(1)
  }
  console.log(`Release API address OK: ${env.VITE_API_BASE_URL}`)
}
