import { expect, test } from 'bun:test'
import { gravatarUrl } from '../src/lib/avatar'

test('Gravatar uses normalized email SHA-256 and a missing-image fallback', () => {
  expect(gravatarUrl(' MyEmailAddress@example.com ')).toBe('https://www.gravatar.com/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee?s=256&d=404&r=g')
  expect(gravatarUrl(' USER@EXAMPLE.COM ')).toBe(gravatarUrl('user@example.com'))
  expect(gravatarUrl('user@example.com')).not.toContain('user@example.com')
})
