import {describe, expect, it} from 'vitest'

import {RelationshipChart} from '../../src/charts/RelationshipChart.js'
import {
  getFamilyUnionStatus,
  unionStatus,
} from '../../src/charts/relationshipVisualCodes.js'

const parentFamily = (
  handle,
  father,
  mother,
  children = [],
  type = 'Married'
) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(ref => ({ref})),
  type,
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

const renderChart = async (data, options = {}) => {
  const chart = RelationshipChart(data, {
    grampsId: data[0].gramps_id,
    getImageUrl: () => '',
    ...options,
  })
  await expect.poll(() => chart.querySelector('.node.family')).toBeTruthy()
  return chart
}

const translatedY = element =>
  Number(
    element.getAttribute('transform').match(/translate\([^ ]+ ([^)]+)\)/)[1]
  )

const translatedX = element =>
  Number(element.getAttribute('transform').match(/translate\(([^ ]+)/)[1])

const edgeStartY = edge =>
  Number(edge.getAttribute('d').match(/M [^,]+,([^ ]+)/)[1])

const nodesByHandle = (chart, selector) => {
  const nodes = chart.querySelectorAll(selector)
  return new Map([...nodes].map(node => [node.__data__.handle, node]))
}

const edgeEndPointsX = edge => {
  const points = edge.getAttribute('d').match(/-?[\d.]+,-?[\d.]+/g)
  return [Number(points[0].split(',')[0]), Number(points.at(-1).split(',')[0])]
}

const crossingCount = edges => {
  const endPoints = [...edges].map(edgeEndPointsX)
  let count = 0
  for (let first = 0; first < endPoints.length; first += 1)
    for (let second = first + 1; second < endPoints.length; second += 1)
      if (
        (endPoints[first][0] - endPoints[second][0]) *
          (endPoints[first][1] - endPoints[second][1]) <
        0
      )
        count += 1
  return count
}

describe('relationship chart graph', () => {
  it('lets Graphviz orient a couple to avoid crossing parent branches', async () => {
    const familyA = parentFamily('family-a', 'parent-a1', 'parent-a2')
    const familyB = parentFamily('family-b', 'parent-b1', 'parent-b2')
    const couple = parentFamily('couple', 'child-b', 'child-a')
    const chart = await renderChart([
      person('parent-a1', [familyA]),
      person('parent-a2', [familyA]),
      person('parent-b1', [familyB]),
      person('parent-b2', [familyB]),
      person('child-a', [couple], familyA),
      person('child-b', [couple], familyB),
    ])
    const parentEdges = chart.querySelectorAll(
      '.descent-edge[data-family-handle^="family-"]'
    )

    expect(crossingCount(parentEdges)).toBe(0)
  })

  it('orders relationships by family events then by the Relations list', async () => {
    const referenceFamilies = [
      parentFamily('undated-first', 'shared', 'undated-partner-1'),
      parentFamily('dated-later', 'shared', 'dated-partner-2'),
      parentFamily('dated-earlier', 'shared', 'dated-partner-1'),
      parentFamily('undated-second', 'shared', 'undated-partner-2'),
    ]
    const remarriage = parentFamily(
      'dated-remarriage',
      'dated-partner-1',
      'dated-partner-2'
    )
    const shared = person('shared', referenceFamilies)
    shared.family_list = referenceFamilies.map(family => family.handle)
    shared.profile.families = [
      {handle: 'dated-later', events: [{date: '2000-01-01'}]},
      {handle: 'dated-earlier', events: [{date: '1900-01-01'}]},
    ]
    const firstPartner = person('dated-partner-1', [
      referenceFamilies[2],
      remarriage,
    ])
    firstPartner.profile.families = [
      {handle: 'dated-remarriage', events: [{date: '1950-01-01'}]},
    ]
    const chart = await renderChart([
      shared,
      firstPartner,
      person('dated-partner-2', [referenceFamilies[1], remarriage]),
      person('undated-partner-1', [referenceFamilies[0]]),
      person('undated-partner-2', [referenceFamilies[3]]),
    ])
    const orderedHandles = [...chart.querySelectorAll('.node.family')]
      .toSorted((a, b) => translatedX(a) - translatedX(b))
      .map(node => node.__data__.handle)
    const people = nodesByHandle(chart, '.node.person')
    const referenceX = translatedX(people.get('shared'))

    expect(orderedHandles).toEqual([
      'dated-earlier',
      'dated-remarriage',
      'dated-later',
      'undated-first',
      'undated-second',
    ])
    for (const [handle, node] of people)
      if (handle !== 'shared')
        expect(referenceX).toBeLessThan(translatedX(node))
  })

  it('marks a deceased partner only when another relationship follows', async () => {
    const families = [
      parentFamily('previous-family', 'deceased-partner', 'shared'),
      parentFamily('current-family', 'current-partner', 'shared'),
    ]
    const shared = person('shared', families)
    shared.profile.families = [
      {handle: 'previous-family', events: [{date: '1900-01-01'}]},
      {handle: 'current-family', events: [{date: '1920-01-01'}]},
    ]
    const deceasedPartner = person('deceased-partner', [families[0]])
    deceasedPartner.profile.death = {date: '1910-01-01'}
    const chart = await renderChart([
      shared,
      deceasedPartner,
      person('current-partner', [families[1]]),
    ])
    const familyNodes = nodesByHandle(chart, '.node.family')

    expect(
      familyNodes.get('previous-family').querySelector('.union-death-mark')
    ).toBeTruthy()
    expect(
      familyNodes.get('current-family').querySelector('.union-death-mark')
    ).toBeNull()
  })

  it('keeps family branches aligned without crossings', async () => {
    const families = [
      parentFamily('partner-a-family', 'partner-a', 'shared-person'),
      parentFamily('partner-b-family', 'partner-b', 'shared-person'),
      parentFamily('partner-c-family', 'partner-c', 'shared-person'),
    ]
    const data = [
      person('shared-person', families),
      person('partner-a', [families[0]]),
      person('partner-b', [families[1]]),
      person('partner-c', [families[2]]),
      person('child-a', [], families[0]),
      person('child-b', [], families[1]),
    ]
    const chart = await renderChart(data)
    expect(crossingCount(chart.querySelectorAll('.descent-edge'))).toBe(0)
    const partners = ['partner-a', 'partner-b', 'partner-c']
    const people = nodesByHandle(chart, '.node.person')
    const familyNodes = nodesByHandle(chart, '.node.family')
    for (const edge of chart.querySelectorAll('.descent-edge')) {
      const [sourceX, targetX] = edgeEndPointsX(edge)
      const familyNode = familyNodes.get(
        edge.getAttribute('data-family-handle')
      )
      const childNode = people.get(
        edge.getAttribute('data-target-person-handle')
      )
      const childWidth = Number(
        childNode.querySelector('.personBox').getAttribute('width')
      )

      expect(sourceX).toBeCloseTo(translatedX(familyNode))
      expect(targetX).toBeCloseTo(translatedX(childNode) + childWidth / 2)
    }
    for (const partner of partners) {
      const partnerX = translatedX(people.get(partner))
      const familyNode = familyNodes.get(`${partner}-family`)
      const familyX = translatedX(familyNode)
      const minX = Math.min(partnerX, familyX)
      const maxX = Math.max(partnerX, familyX)

      expect(
        partners.filter(other => {
          const otherX = translatedX(people.get(other))
          return other !== partner && otherX > minX && otherX < maxX
        })
      ).toEqual([])
    }
  })

  it('renders multiple unions without duplicate cards or overlapping relation lines', async () => {
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

    const chart = await renderChart(data)
    expect(chart.querySelectorAll('.node.person')).toHaveLength(4)
    expect(
      new Set(
        [...chart.querySelectorAll('.family-hit-target')].map(marker =>
          marker.getAttribute('cy')
        )
      ).size
    ).toBe(3)
    for (const familyNode of chart.querySelectorAll('.node.family')) {
      const handle = familyNode.__data__.handle
      const nodeY = translatedY(familyNode)
      const markerY = Number(
        familyNode.querySelector('.family-hit-target').getAttribute('cy')
      )
      const expectedY = nodeY + markerY
      const unionEdges = chart.querySelectorAll(
        `.union-edge[data-family-handle="${handle}"]`
      )
      expect(unionEdges).toHaveLength(2)
      for (const edge of unionEdges)
        expect(edgeStartY(edge)).toBeCloseTo(expectedY)
    }
    const personNodes = nodesByHandle(chart, '.node.person')
    for (const edge of chart.querySelectorAll('.union-edge')) {
      const personNode = personNodes.get(
        edge.getAttribute('data-person-handle')
      )
      const personTop = translatedY(personNode)
      const personHeight = Number(
        personNode.querySelector('.personBox').getAttribute('height')
      )
      const edgeY = edgeStartY(edge)
      expect(edgeY).toBeGreaterThan(personTop)
      expect(edgeY).toBeLessThan(personTop + personHeight)
    }
  })

  it('uses gender-colored union segments and neutral descent lines', async () => {
    const family = {
      ...parentFamily('family-1', 'father', 'mother'),
      gramps_id: 'F0001',
    }
    const data = [
      {
        ...person('father', [family]),
        profile: {gramps_id: 'father', name_given: 'Father', sex: 'M'},
      },
      {
        ...person('mother', [family]),
        profile: {gramps_id: 'mother', name_given: 'Mother', sex: 'F'},
      },
      person('child', [], family),
    ]

    const chart = await renderChart(data)
    expect(
      [...chart.querySelectorAll('.union-edge')].map(edge =>
        edge.getAttribute('stroke')
      )
    ).toEqual(expect.arrayContaining(['var(--color-boy)', 'var(--color-girl)']))
    expect(chart.querySelector('.descent-edge').getAttribute('stroke')).toBe(
      'var(--grampsjs-body-font-color-40)'
    )
  })

  it('fades a union line where it passes behind another person', async () => {
    const firstFamily = parentFamily('family-a-b', 'person-a', 'person-b')
    const secondFamily = parentFamily('family-a-c', 'person-a', 'person-c')
    const crossingFamily = parentFamily('family-b-c', 'person-b', 'person-c')
    const chart = await renderChart([
      person('person-a', [firstFamily, secondFamily]),
      person('person-b', [firstFamily, crossingFamily]),
      person('person-c', [secondFamily, crossingFamily]),
    ])
    const fadedEdges = [...chart.querySelectorAll('.union-edge')].filter(edge =>
      edge.getAttribute('stroke').startsWith('url(#union-edge-gradient-')
    )

    expect(fadedEdges.length).toBeGreaterThan(0)
    expect(
      [...chart.querySelector('.union-occlusion-gradient').children].map(stop =>
        stop.getAttribute('stop-opacity')
      )
    ).toEqual(expect.arrayContaining(['1', '0.2']))
  })

  it('renders status symbols and makes a known family accessible', async () => {
    const family = parentFamily('family-1', 'father', 'mother', [], 'Divorced')
    const father = person('father', [family])
    father.profile.families = [
      {
        family_handle: 'family-1',
        profile: {
          gramps_id: 'F0001',
          relationship: 'Divorced',
        },
      },
    ]
    const data = [father, person('mother', [family])]
    const chart = await renderChart(data, {
      unionLabel: () => 'Divorced',
    })
    const familyNode = chart.querySelector('.node.family')
    expect(familyNode.querySelectorAll('.union-ring')).toHaveLength(2)
    expect(familyNode.querySelector('.union-divorce-slash')).toBeTruthy()
    expect(familyNode.getAttribute('role')).toBe('link')
    expect(familyNode.getAttribute('tabindex')).toBe('0')
    expect(familyNode.getAttribute('aria-label')).toBe('Divorced')

    const navigation = new Promise(resolve =>
      window.addEventListener('nav', resolve, {once: true})
    )
    familyNode.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    const event = await navigation
    expect(event.detail).toEqual({path: 'family/F0001'})
  })
})

describe('family relationship status', () => {
  it('classifies supported family relationships', () => {
    const cases = [
      ['married', {type: {value: 0}}, unionStatus.married],
      ['unmarried', {type: {value: 1}}, unionStatus.partners],
      ['civil union', {type: {value: 2}}, unionStatus.partners],
      ['unknown', {type: {value: 3}}, unionStatus.unknown],
      [
        'divorced',
        {type: {value: 4, string: 'Divorced'}},
        unionStatus.divorced,
      ],
      [
        'divorce event',
        {type: {value: 0}, divorce: {date: '2000-01-01'}},
        unionStatus.divorced,
      ],
    ]

    for (const [relationship, family, expected] of cases)
      expect(getFamilyUnionStatus(family), relationship).toBe(expected)
  })
})
