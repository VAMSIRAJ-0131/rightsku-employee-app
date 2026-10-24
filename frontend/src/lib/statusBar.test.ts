import { describe, expect, it } from 'vitest'
import { SystemBarsStyle } from '@capacitor/core'
import { barStyleFor } from './statusBar'

describe('status bar icons', () => {
  it('are dark on the light app and white on the dark app', () => {
    // LIGHT = dark icons for a light background; DARK = light icons for a dark background.
    expect(barStyleFor('light')).toBe(SystemBarsStyle.Light)
    expect(barStyleFor('dark')).toBe(SystemBarsStyle.Dark)
  })
})
