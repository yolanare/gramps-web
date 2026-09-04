import {describe, expect, it, vi} from 'vitest'

import '../../src/components/GrampsjsObjectPreview.js'

describe('object preview hover handling', () => {
  it('does not replace a preview from links hovered inside its popup', () => {
    const preview = document.createElement('grampsjs-object-preview')
    preview._mouseInPopup = true
    preview._showPreview = vi.fn()

    preview._handleShow({})

    expect(preview._showPreview).not.toHaveBeenCalled()
  })
})
