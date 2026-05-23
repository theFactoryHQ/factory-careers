import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Dockerfile private package auth', () => {
  const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8')

  it('mounts the Render npm_token secret file during npm ci', () => {
    expect(dockerfile).toContain(
      '--mount=type=secret,id=npm_token,dst=/etc/secrets/npm_token,required=false',
    )
    expect(dockerfile).toContain('/etc/secrets/npm_token')
    expect(dockerfile).toContain('@caffeinebounce:registry=https://npm.pkg.github.com/')
    expect(dockerfile).toContain('//npm.pkg.github.com/:_authToken=%s')
  })
})
