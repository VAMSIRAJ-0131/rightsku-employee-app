import { describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY, applyTheme, readThemeChoice, resolveTheme, saveThemeChoice } from './theme'

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  }
}

describe('employee theme', () => {
  it('defaults to System when nothing is saved', () => {
    expect(readThemeChoice(memoryStore())).toBe('system')
    expect(readThemeChoice(null)).toBe('system')
  })

  it('remembers the choice (as after an app restart)', () => {
    const store = memoryStore()
    expect(saveThemeChoice('dark', store)).toBe(true)
    expect(store.data[THEME_STORAGE_KEY]).toBe('dark')
    // A new read, as when the app starts again, finds the same choice.
    expect(readThemeChoice(store)).toBe('dark')
    saveThemeChoice('light', store)
    expect(readThemeChoice(store)).toBe('light')
  })

  it('ignores anything invalid and survives blocked storage', () => {
    expect(readThemeChoice(memoryStore({ [THEME_STORAGE_KEY]: 'purple' }))).toBe('system')
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(readThemeChoice(blocked)).toBe('system')
    expect(saveThemeChoice('dark', blocked)).toBe(false)
  })

  it('System follows the phone; Light and Dark ignore it', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('sets the theme on the page root and removes it when the employee app closes', () => {
    const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } } as unknown as HTMLElement
    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
    applyTheme(root, 'light')
    expect(root.dataset.theme).toBe('light')
    applyTheme(root, null)
    expect(root.dataset.theme).toBeUndefined()
    expect(root.style.colorScheme).toBe('')
  })
})
