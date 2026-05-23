import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('auth error toast surface', () => {
  it('mounts the global toast renderer on auth pages', () => {
    expect(read('app/layouts/auth.vue')).toContain('<AppToasts />')
  })

  it('shows Microsoft sign-in failures through toast errors', () => {
    const source = read('app/pages/auth/sign-in.vue')

    expect(source).toContain('const toast = useToast()')
    expect(source).toContain('toast.error(')
    expect(source).not.toContain('v-if="error"')
  })

  it('shows social sign-up failures through toast errors', () => {
    const source = read('app/pages/auth/sign-up.vue')

    expect(source).toContain('const toast = useToast()')
    expect(source).toContain('toast.error(')
  })
})
