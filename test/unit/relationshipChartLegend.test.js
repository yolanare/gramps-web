import {render} from 'lit'
import {describe, expect, it} from 'vitest'

import {GrampsjsViewRelationshipChart} from '../../src/views/GrampsjsViewRelationshipChart.js'

describe('relationship chart legend', () => {
  it('shows every legend entry', () => {
    const view = new GrampsjsViewRelationshipChart()
    const container = document.createElement('div')
    view._ = value => value

    render(view.renderPreferencesExtra(), container)

    const items = [...container.querySelectorAll('.legend-item')]
    expect(items).toHaveLength(6)
    for (const item of items)
      expect(item.querySelector('.legend-sample')).toBeTruthy()
    expect(container.querySelector('.legend-note')).toBeTruthy()
  })
})
