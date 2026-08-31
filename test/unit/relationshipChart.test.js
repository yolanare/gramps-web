import {describe, expect, it} from 'vitest'
import {Graphviz} from '@hpcc-js/wasm'

import {
  RelationshipChart,
  createRelationshipGraphDot,
} from '../../src/charts/RelationshipChart.js'

const parentFamily = (handle, father, mother, children = []) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(ref => ({ref})),
  type: 'Married',
})

const person = (handle, families = [], primaryParentFamily = {}) => ({
  handle,
  gramps_id: handle,
  profile: {gramps_id: handle, name_given: handle},
  extended: {
    families,
    primary_parent_family: primaryParentFamily,
  },
})

describe('relationship chart graph', () => {
  it('uses one person node when a person belongs to several families', () => {
    const firstFamily = parentFamily('family-1', 'shared', 'partner-1')
    const secondFamily = parentFamily('family-2', 'shared', 'partner-2')
    const data = [
      person('shared', [firstFamily, secondFamily]),
      person('partner-1', [firstFamily]),
      person('partner-2', [secondFamily]),
    ]

    const dot = createRelationshipGraphDot(data)

    expect(dot.match(/class="person_shared"/g)).toHaveLength(1)
    expect(dot).toContain('"person_shared" -> "family_family-1"')
    expect(dot).toContain('"person_shared" -> "family_family-2"')
    expect(dot).not.toContain('fakeparent')
  })

  it('connects every family branch to the shared person node', () => {
    const firstFamily = parentFamily('family-1', 'shared', 'partner-1', [
      'child-1',
    ])
    const secondFamily = parentFamily('family-2', 'shared', 'partner-2', [
      'child-2',
    ])
    const data = [
      person('shared', [firstFamily, secondFamily]),
      person('partner-1', [firstFamily]),
      person('partner-2', [secondFamily]),
      person('child-1', [], firstFamily),
      person('child-2', [], secondFamily),
    ]

    const dot = createRelationshipGraphDot(data)

    expect(dot).toContain('"family_family-1" -> "person_child-1"')
    expect(dot).toContain('"family_family-2" -> "person_child-2"')
    expect(dot.match(/class="person_shared"/g)).toHaveLength(1)
  })

  it('renders the shared person only once in the Graphviz layout', async () => {
    const firstFamily = parentFamily('family-1', 'shared', 'partner-1', [
      'child-1',
    ])
    const secondFamily = parentFamily('family-2', 'shared', 'partner-2', [
      'child-2',
    ])
    const data = [
      person('shared', [firstFamily, secondFamily]),
      person('partner-1', [firstFamily]),
      person('partner-2', [secondFamily]),
      person('child-1', [], firstFamily),
      person('child-2', [], secondFamily),
    ]
    const graphviz = await Graphviz.load()

    const svg = graphviz.layout(createRelationshipGraphDot(data), 'svg', 'dot')
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const x = className =>
      Number(document.querySelector(`.${className} text`).getAttribute('x'))
    const y = className =>
      Number(document.querySelector(`.${className} text`).getAttribute('y'))
    const expectBetween = (value, first, second) => {
      expect(value).toBeGreaterThanOrEqual(Math.min(first, second))
      expect(value).toBeLessThanOrEqual(Math.max(first, second))
    }

    expect(svg.match(/class="node person_shared"/g)).toHaveLength(1)
    expect(y('person_partner-1')).toBe(y('person_shared'))
    expect(y('person_partner-2')).toBe(y('person_shared'))
    expect(y('family_family-1')).toBe(y('person_shared'))
    expect(y('family_family-2')).toBe(y('person_shared'))
    expect(y('person_child-1')).not.toBe(y('person_shared'))
    expect(y('person_child-2')).not.toBe(y('person_shared'))
    expectBetween(
      x('family_family-1'),
      x('person_shared'),
      x('person_partner-1')
    )
    expectBetween(
      x('family_family-2'),
      x('person_shared'),
      x('person_partner-2')
    )
  })

  it('keeps three unions aligned around their shared person', async () => {
    const families = [
      parentFamily('family-1', 'shared', 'partner-1'),
      parentFamily('family-2', 'shared', 'partner-2'),
      parentFamily('family-3', 'shared', 'partner-3'),
    ]
    const data = [
      person('shared', families),
      ...families.map((family, index) =>
        person(`partner-${index + 1}`, [family])
      ),
    ]
    const graphviz = await Graphviz.load()

    const svg = graphviz.layout(createRelationshipGraphDot(data), 'svg', 'dot')
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const coordinate = (className, name) =>
      Number(
        document
          .querySelector(`.${className} text`)
          .getAttribute(name.toLowerCase())
      )
    const sharedX = coordinate('person_shared', 'x')
    const partnerXs = families.map((_, index) =>
      coordinate(`person_partner-${index + 1}`, 'x')
    )

    expect(svg.match(/class="node person_shared"/g)).toHaveLength(1)
    expect(partnerXs.filter(x => x < sharedX)).toHaveLength(2)
    expect(partnerXs.filter(x => x > sharedX)).toHaveLength(1)
    for (let index = 1; index <= families.length; index += 1) {
      expect(coordinate(`person_partner-${index}`, 'y')).toBe(
        coordinate('person_shared', 'y')
      )
      const familyX = coordinate(`family_family-${index}`, 'x')
      const partnerX = coordinate(`person_partner-${index}`, 'x')
      expect(familyX).toBeGreaterThanOrEqual(Math.min(sharedX, partnerX))
      expect(familyX).toBeLessThanOrEqual(Math.max(sharedX, partnerX))
    }
  })

  it('remasters a multiple-union group without duplicate cards', async () => {
    const families = [
      parentFamily('family-1', 'shared', 'partner-1'),
      parentFamily('family-2', 'shared', 'partner-2'),
      parentFamily('family-3', 'shared', 'partner-3'),
    ]
    const data = [
      person('shared', families),
      ...families.map((family, index) =>
        person(`partner-${index + 1}`, [family])
      ),
    ]

    const chart = RelationshipChart(data, {
      grampsId: 'shared',
      getImageUrl: () => '',
    })

    await expect
      .poll(() => chart.querySelectorAll('.node.person').length)
      .toBe(4)
    expect(chart.querySelectorAll('.node.family')).toHaveLength(3)
    expect(chart.querySelectorAll('.edges .edge')).toHaveLength(6)
  })
})
