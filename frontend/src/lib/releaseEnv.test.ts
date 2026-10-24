import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JavaScript build script, no type declarations
import { releaseApiProblem } from '../../scripts/check-release-env.mjs'

describe('release API address check', () => {
  it('accepts a public HTTPS address', () => {
    expect(releaseApiProblem('https://api.rightsku.com')).toBeNull()
  })

  it('refuses a missing, plain-HTTP, or laptop / Wi-Fi address', () => {
    expect(releaseApiProblem('')).toMatch(/not set/)
    expect(releaseApiProblem('http://api.rightsku.com')).toMatch(/https/)
    expect(releaseApiProblem('https://192.168.31.172:8080')).toMatch(/private-network/)
    expect(releaseApiProblem('https://localhost:8080')).toMatch(/private-network/)
    expect(releaseApiProblem('https://10.0.0.5')).toMatch(/private-network/)
  })
})
