import { describe, expect, it, vi } from 'vitest'
import { createBackStack } from './backStack'

describe('Android back', () => {
  it('runs only the top-most handler: an open dropdown closes before the screen goes back', () => {
    const stack = createBackStack()
    const screenBack = vi.fn()
    const closeDropdown = vi.fn()
    stack.push(screenBack)
    const removeDropdown = stack.push(closeDropdown)

    expect(stack.back()).toBe(true)
    expect(closeDropdown).toHaveBeenCalledTimes(1)
    expect(screenBack).not.toHaveBeenCalled()

    removeDropdown()
    expect(stack.back()).toBe(true)
    expect(screenBack).toHaveBeenCalledTimes(1)
  })

  it('reports false with nothing registered, so the app goes to the background', () => {
    expect(createBackStack().back()).toBe(false)
  })

  it('a handler can pass Back on to the one below', () => {
    const stack = createBackStack()
    const below = vi.fn()
    stack.push(below)
    stack.push(() => false)
    expect(stack.back()).toBe(true)
    expect(below).toHaveBeenCalledTimes(1)
  })

  it('an app-level fallback runs only after screen handlers, even when registered last', () => {
    const stack = createBackStack()
    const calls: string[] = []
    stack.push(() => { calls.push('screen') })
    stack.push(() => { calls.push('home') }, 'app')
    stack.back()
    expect(calls).toEqual(['screen'])
  })

  it('removing a handler twice, or out of order, is safe', () => {
    const stack = createBackStack()
    const a = stack.push(() => {})
    const b = stack.push(() => {})
    a()
    a()
    expect(stack.size()).toBe(1)
    b()
    expect(stack.size()).toBe(0)
  })
})
