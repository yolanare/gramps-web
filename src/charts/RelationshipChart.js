import {create, select} from 'd3-selection'
import {zoom} from 'd3-zoom'
import {linkVertical} from 'd3-shape'
import {Graphviz} from '@hpcc-js/wasm'
import {chartNameDisplayFormat, fireEvent} from '../util.js'
import {appendAddPersonButton} from './addPersonButton.js'
import {getPersonEventCardText} from './util.js'
import {
  genderColor,
  getFamilyUnionStatus,
  getUnionMarkerPaths,
  getUnionVisualCode,
  unionLineStrokeWidth,
  unionStatus,
} from './relationshipVisualCodes.js'

function createGraph(graph) {
  const data = graph.getData()

  // step 1: collect all persons to be shown
  for (const p of data) {
    graph.addPerson(p)
  }

  // step 2: create nodes for relevant families
  for (const p of data) {
    for (const f of p.extended.families) {
      if (graph.known(f.father_handle) && graph.known(f.mother_handle)) {
        graph.addNode(f, f.handle, f.father_handle, f.mother_handle)
      }
    }
    if (p.extended?.primary_parent_family?.handle) {
      const f = p.extended.primary_parent_family
      graph.addNode(f, f.handle, f.father_handle, f.mother_handle)
    }
  }

  // step 3: create parent-child edges
  for (const p of data) {
    const f = p.extended.primary_parent_family
    const father = f.father_handle
    const mother = f.mother_handle
    if (graph.known(father) && graph.known(mother)) {
      graph.addEdge(f.handle, false, p.handle)
    } else if (graph.known(father)) {
      graph.addEdge(f.handle, father, p.handle)
    } else if (graph.known(mother)) {
      graph.addEdge(f.handle, mother, p.handle)
    }
  }
}

function getPartnerFamilyGroups(nodes) {
  const families = nodes.filter(node => node.father && node.mother)
  const familiesByPerson = new Map()
  for (const family of families) {
    for (const person of [family.father, family.mother]) {
      const personFamilies = familiesByPerson.get(person) ?? []
      personFamilies.push(family)
      familiesByPerson.set(person, personFamilies)
    }
  }

  const groups = []
  const visitedFamilies = new Set()
  for (const firstFamily of families) {
    if (visitedFamilies.has(firstFamily.handle)) continue
    const group = {families: [], persons: new Set()}
    const queue = [firstFamily]
    while (queue.length > 0) {
      const family = queue.shift()
      if (visitedFamilies.has(family.handle)) continue
      visitedFamilies.add(family.handle)
      group.families.push(family)
      for (const person of [family.father, family.mother]) {
        group.persons.add(person)
        for (const relatedFamily of familiesByPerson.get(person) ?? []) {
          if (!visitedFamilies.has(relatedFamily.handle)) {
            queue.push(relatedFamily)
          }
        }
      }
    }
    groups.push(group)
  }
  return groups
}

function sortableDate(value) {
  const parts = (value ?? '').match(/(-?\d{3,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/)
  if (!parts) return null
  return (
    Number(parts[1]) * 10000 +
    Number(parts[2] ?? 0) * 100 +
    Number(parts[3] ?? 0)
  )
}

function familyDate(profile) {
  const dates = [
    profile.marriage?.date,
    profile.divorce?.date,
    ...(profile.events ?? []).map(event => event.date),
  ]
    .map(sortableDate)
    .filter(date => date !== null)
  return dates.length ? Math.min(...dates) : null
}

function compareDates(first, second) {
  if (first === null) return second === null ? 0 : 1
  if (second === null) return -1
  return first - second
}

function orderFamilyGroup(group, graph) {
  const familyCounts = new Map([...group.persons].map(person => [person, 0]))
  for (const family of group.families)
    for (const person of [family.father, family.mother])
      familyCounts.set(person, familyCounts.get(person) + 1)

  const reference = [...group.persons].reduce((current, person) =>
    familyCounts.get(person) > familyCounts.get(current) ? person : current
  )
  const visitedFamilies = new Set()
  const visitedPeople = new Set([reference])
  const orderedPeople = [reference]
  const orderedFamilies = []

  while (visitedFamilies.size < group.families.length) {
    const candidates = group.families
      .filter(
        family =>
          !visitedFamilies.has(family.handle) &&
          (visitedPeople.has(family.father) || visitedPeople.has(family.mother))
      )
      .map(family => {
        const connectingIndex = orderedPeople.findIndex(
          person => person === family.father || person === family.mother
        )
        return {
          family,
          connectingIndex,
          connectingPerson: orderedPeople[connectingIndex],
        }
      })
      .toSorted(
        (first, second) =>
          compareDates(first.family.date, second.family.date) ||
          first.connectingIndex - second.connectingIndex ||
          graph.getFamilyOrder(first.connectingPerson, first.family.handle) -
            graph.getFamilyOrder(second.connectingPerson, second.family.handle)
      )
    if (!candidates.length) throw new Error('Disconnected family group')

    const {family} = candidates[0]
    visitedFamilies.add(family.handle)
    orderedFamilies.push(family)
    for (const person of [family.father, family.mother]) {
      if (visitedPeople.has(person)) continue
      visitedPeople.add(person)
      orderedPeople.push(person)
    }
  }

  const personPositions = new Map(
    orderedPeople.map((person, index) => [person, index])
  )
  const familiesBeforePerson = new Map()
  for (const family of orderedFamilies) {
    const laterPerson =
      personPositions.get(family.father) > personPositions.get(family.mother)
        ? family.father
        : family.mother
    const families = familiesBeforePerson.get(laterPerson) ?? []
    families.push({type: 'family', handle: family.handle})
    familiesBeforePerson.set(laterPerson, families)
  }

  return {
    items: orderedPeople.flatMap(person => [
      ...(familiesBeforePerson.get(person) ?? []),
      {type: 'person', handle: person},
    ]),
    families: orderedFamilies,
  }
}

function markWidowedFamilies(graph, group) {
  for (const person of group.persons) {
    const personDeath = sortableDate(graph.known(person).profile?.death?.date)
    const families = group.families
      .filter(family => family.father === person || family.mother === person)
      .toSorted(
        (first, second) =>
          compareDates(first.date, second.date) ||
          graph.getFamilyOrder(person, first.handle) -
            graph.getFamilyOrder(person, second.handle)
      )
    for (let index = 0; index < families.length - 1; index += 1) {
      const family = families[index]
      if (family.status === unionStatus.divorced) continue
      const partner = family.father === person ? family.mother : family.father
      const partnerDeath = sortableDate(
        graph.known(partner).profile?.death?.date
      )
      const nextFamilyDate = families[index + 1].date
      if (partnerDeath === null) continue
      if (personDeath !== null && personDeath <= partnerDeath) continue
      if (nextFamilyDate !== null && partnerDeath >= nextFamilyDate) continue
      family.deceasedPartner = partner
    }
  }
}

const personNodeId = handle => `person_${handle}`
const familyNodeId = handle => `family_${handle}`
const familyNodeWidth = 0.8
const unionLineOffset = 12
const unionLineVerticalInset = 15
const genderStripLeftOverflow = 4
const graphNodeHeight = graph => graph.boxHeight / 66 - 0.3
const personNodeDot = (graph, handle) => `
  "${personNodeId(handle)}" [
    class="person_${handle}"
    margin=0.25
    shape="none"
    fixedsize=true
    width=${graph.boxWidth / 66}
    height=${graphNodeHeight(graph)}
    label=<->
  ]
`
const itemNodeId = item => `${item.type}_${item.handle}`

function generateDot(graph) {
  let dot = ''

  const groupedPeople = new Set()
  const familyGroups = getPartnerFamilyGroups(graph.getNodes())
  for (const [groupIndex, group] of familyGroups.entries()) {
    for (const person of group.persons) groupedPeople.add(person)
    markWidowedFamilies(graph, group)
    const {items: ordered, families: orderedFamilies} = orderFamilyGroup(
      group,
      graph
    )
    const offsetStep = Math.min(
      unionLineOffset,
      Math.max(0, graph.boxHeight - 2 * unionLineVerticalInset) /
        Math.max(1, orderedFamilies.length - 1)
    )
    for (const [index, family] of orderedFamilies.entries())
      graph.getNode(family.handle).unionOffset =
        (index - (orderedFamilies.length - 1)) * offsetStep
    dot += `
      subgraph "cluster_family_group_${groupIndex}" {
        cluster=true
        color=white
        margin="50,0"
        label="."
        subgraph "family_group_rank_${groupIndex}" {
          rank=same
    `
    for (const item of ordered) {
      if (item.type === 'person') {
        dot += personNodeDot(graph, item.handle)
      } else {
        dot += `
        "${familyNodeId(item.handle)}" [
          class="family_${item.handle}"
          label=<.>
          shape="none"
          margin=0
          fixedsize=true
          width=${familyNodeWidth}
          height=${graphNodeHeight(graph)}
        ]
        `
      }
    }
    if (orderedFamilies.length > 1)
      for (let index = 1; index < ordered.length; index += 1)
        dot += `"${itemNodeId(ordered[index - 1])}" -> "${itemNodeId(
          ordered[index]
        )}" [style=invis, weight=1000]
        `
    dot += '}}'

    for (const family of group.families) {
      const familyId = familyNodeId(family.handle)
      const fatherId = personNodeId(family.father)
      const motherId = personNodeId(family.mother)
      const fatherEdgeClass = `union_edge union_person_${family.father} union_family_${family.handle}`
      const motherEdgeClass = `union_edge union_person_${family.mother} union_family_${family.handle}`
      dot += `
      "${fatherId}" -> "${familyId}" [class="${fatherEdgeClass}", tailport=s, headport=s, constraint=false, label="", arrowhead=none, color="#555"]
      "${familyId}" -> "${motherId}" [class="${motherEdgeClass}", tailport=s, headport=s, constraint=false, label="", arrowhead=none, color="#555"]
      `
    }
  }

  for (const person of graph.getPersons()) {
    if (groupedPeople.has(person.handle)) continue
    dot += `
      subgraph "cluster_person_${person.handle}" {
        cluster=true
        color=white
        label="."
        ${personNodeDot(graph, person.handle)}
      }
    `
  }

  // Parent-child edges preserve the original family or single-parent source.
  for (const e of graph.getEdges()) {
    const source = e.sourcePerson
      ? personNodeId(e.sourcePerson)
      : familyNodeId(e.sourceFamily)
    const target = personNodeId(e.targetPerson)
    const descentClass = e.sourcePerson
      ? 'descent_edge'
      : `descent_edge descent_family_${e.sourceFamily}`
    dot += `"${source}" -> "${target}" [class="${descentClass}", label="", arrowhead=none, color="#555"]
      `
  }

  // frame dot code with global commands
  dot = `
    digraph gramps {
      compound=true
      newrank=true
      ranksep=2.8
      labelloc="t"
      charset="UTF-8"
      pad=2
      splines=polyline
      //splines=ortho
      //splines=spline
      // this controls the number of iterations = nslimit * no_nodes
      nslimit=2.0
      nodesep=0
      ${dot}
    }
  `
  return dot
}

class Relgraph {
  constructor(data, boxWidth, boxHeight, grampsId) {
    this.data = data
    this.boxWidth = boxWidth
    this.boxHeight = boxHeight
    this.rootPersonGrampsId = grampsId
    this.rootPerson = undefined
    this.nodes = {}
    this.edges = {}
    this.persons = {}
    this.dot = undefined
    this.shrinkToFit = false
    this.familyProfiles = new Map()
    for (const person of data) {
      for (const family of person.profile?.families ?? []) {
        const handle = family.handle ?? family.family_handle
        if (handle) this.familyProfiles.set(handle, family.profile ?? family)
      }
    }
    createGraph(this)
  }

  getData() {
    return this.data
  }

  getDot() {
    if (!this.dot) {
      this.dot = generateDot(this)
    }
    return this.dot
  }

  addPerson(p) {
    const me = p.handle
    this.persons[me] = {
      handle: me,
      profile: p.profile,
      data: p,
    }
    if (p.gramps_id === this.rootPersonGrampsId) {
      this.rootPerson = this.persons[me]
    }
  }

  getRootPerson() {
    return this.rootPerson
  }

  getPersons() {
    return Object.values(this.persons)
  }

  known(me) {
    return this.persons[me] || false
  }

  getFamilyOrder(person, family) {
    const data = this.known(person).data
    const handles =
      data.family_list?.length > 0
        ? data.family_list
        : data.extended.families.map(item => item.handle)
    const index = handles.indexOf(family)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }

  addNode(fdata, family, father, mother) {
    const profile = this.familyProfiles.get(family) ?? fdata.profile ?? fdata
    const n = {
      handle: family,
      date: familyDate(profile),
      status: getFamilyUnionStatus({...fdata, profile}),
      grampsId: profile.gramps_id ?? fdata.gramps_id,
      fake: fdata.fake,
    }
    if (father && this.known(father)) {
      n.father = father
      // map persondata into node
      n.fatherdata = this.known(father)
    }
    if (mother && this.known(mother)) {
      n.mother = mother
      // map persondata into node
      n.motherdata = this.known(mother)
    }
    if (n.father || n.mother) {
      this.nodes[family] = n
    }
  }

  getNode(family) {
    return this.nodes[family] || false
  }

  getNodes() {
    return Object.values(this.nodes)
  }

  addEdge(sourcefamily, sourceperson, targetperson) {
    const key = `${sourcefamily}__${sourceperson}__${targetperson}`
    this.edges[key] = {
      sourceFamily: sourcefamily,
      sourcePerson: sourceperson,
      targetPerson: targetperson,
    }
  }

  getEdges() {
    return Object.values(this.edges)
  }
}

export function createRelationshipGraphDot(
  data,
  boxWidth = 190,
  boxHeight = 90
) {
  return new Relgraph(data, boxWidth, boxHeight).getDot()
}

const clipString = (s, length) => {
  if (!s) {
    return ''
  }
  const fontSize = 13
  const nChar = length / (fontSize * 0.6)
  if (s.length <= nChar) {
    return s
  }
  if (nChar < 2) {
    return ''
  }
  return `${s.slice(0, nChar - 2)}…`
}

function clicked(event, d) {
  dispatchEvent(
    new CustomEvent('pedigree:person-selected', {
      bubbles: true,
      composed: true,
      detail: {grampsId: d.profile?.gramps_id},
    })
  )
}

function showPreview(target, objectType, grampsId) {
  if (!grampsId || window.matchMedia('(hover: none)').matches) return
  const anchorRect = target.getBoundingClientRect()
  window.dispatchEvent(
    new CustomEvent('object:preview-show', {
      detail: {objectType, grampsId, anchorRect},
    })
  )
}

function hidePreview() {
  if (!window.matchMedia('(hover: none)').matches)
    window.dispatchEvent(new CustomEvent('object:preview-hide'))
}

function remasterChart(
  divhidden,
  targetsvg,
  graph,
  boxWidth,
  boxHeight,
  imgPadding,
  getImageUrl,
  maxImages,
  nameDisplayFormat,
  canEdit = false,
  unionLabel
) {
  const gvchartx = divhidden.select('svg')
  const nodedata = []
  const imgRadius = (boxHeight - imgPadding * 2) / 2
  const textPadding = d =>
    d.imageUrl ? 2 * imgRadius + 2 * imgPadding : 2 * imgPadding
  const boxWidthTotal = d => boxWidth - textPadding(d)
  gvchartx.selectAll('title').remove()
  // based on graphviz created nodes build array containing node data to be bound to d3 nodes
  let imageCount = 0
  gvchartx.selectAll('.node').each(function () {
    const e = select(this)
    const textElement = e.select('text')
    const x = textElement.attr('x')
    const y = textElement.attr('y')
    const c = e.attr('class')
    const found = c.match(/(?<handletype>family|person)_(?<handle>\S+)/)
    if (found.groups.handletype === 'person') {
      const d = graph.known(found.groups.handle)
      const imageUrl = getImageUrl(d)
      if (imageUrl) {
        imageCount += 1
      }
      nodedata.push({
        nodetype: d.profile.fake ? 'fake' : 'person',
        xCoord: x - boxWidth / 2 + genderStripLeftOverflow,
        yCoord: y - boxHeight / 2,
        profile: d.profile,
        data: d.data,
        imageUrl: imageCount > maxImages ? '' : imageUrl,
        handle: found.groups.handle,
      })
    } else if (found.groups.handletype === 'family') {
      const d = graph.getNode(found.groups.handle)
      nodedata.push({
        nodetype: 'family',
        xCoord: Number(x) + genderStripLeftOverflow / 2,
        yCoord: Number(y),
        status: d.status,
        grampsId: d.grampsId,
        unionOffset: d.unionOffset ?? 0,
        deceasedPartner: d.deceasedPartner,
        handle: found.groups.handle,
      })
    }
  })
  // container for edges
  const edges = targetsvg.append('g').attr('class', 'edges')

  // build d3 based nodes with data bound to them
  const nodes = targetsvg
    .selectAll('.node')
    .data(nodedata)
    .enter()
    .append('g')
    .attr('transform', d => `translate(${d.xCoord} ${d.yCoord})`)
    .attr('class', d => `node ${d.nodetype}`)

  nodes
    .filter(d => d.nodetype === 'person')
    .append('rect')
    .attr('fill', d => genderColor[d.profile?.sex] ?? 'var(--color-unknown)')
    .attr('width', 24)
    .attr('height', boxHeight - 1)
    .attr('x', -genderStripLeftOverflow)
    .attr('y', 0)
    .attr('rx', 12)
    .attr('ry', 12)

  nodes
    .filter(d => d.nodetype === 'person')
    .append('rect', ':first-child')
    .attr('width', boxWidth)
    .attr('height', boxHeight)
    .attr('class', 'personBox')
    .attr('x', 0)
    .attr('y', 0)
    .attr('rx', 8)
    .attr('ry', 8)

  nodes
    .filter(
      d =>
        (d.profile?.name_given || d.profile?.name_surname) &&
        d.nodetype === 'person'
    )
    .append('text')
    .attr('text-anchor', 'start')
    .attr('font-weight', '500')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .attr('text-overflow', 'ellipsis')
    .attr('overflow', 'hidden')
    .attr('x', d => textPadding(d))
    .attr('y', 25)
    .text(d =>
      clipString(
        nameDisplayFormat === chartNameDisplayFormat.surnameThenGiven
          ? `${d.profile?.name_surname},`
          : d.profile?.name_given,
        boxWidthTotal(d)
      )
    )

  nodes
    .filter(
      d =>
        (d.profile?.name_given || d.profile?.name_surname) &&
        d.nodetype === 'person'
    )
    .append('text')
    .attr('text-anchor', 'start')
    .attr('font-weight', '500')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .attr('text-overflow', 'ellipsis')
    .attr('overflow', 'hidden')
    .attr('x', d => textPadding(d))
    .attr('y', 25 + 17)
    .text(d =>
      clipString(
        nameDisplayFormat === chartNameDisplayFormat.surnameThenGiven
          ? d.profile?.name_given
          : d.profile?.name_surname,
        boxWidthTotal(d)
      )
    )

  nodes
    .filter(
      d =>
        d.nodetype === 'person' &&
        getPersonEventCardText(d.data, 'birth') !== null
    )
    .append('text')
    .attr('text-anchor', 'start')
    .attr('font-weight', '350')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .attr('x', d => textPadding(d))
    .attr('y', 25 + 17 * 2)
    .text(d =>
      clipString(
        `*${getPersonEventCardText(d.data, 'birth')}`,
        boxWidthTotal(d)
      )
    )

  nodes
    .filter(
      d =>
        d.nodetype === 'person' &&
        getPersonEventCardText(d.data, 'death') !== null
    )
    .append('text')
    .attr('text-anchor', 'start')
    .attr('font-weight', '350')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .attr('x', d => textPadding(d))
    .attr('y', 25 + 17 * 3)
    .text(d =>
      clipString(
        `†${getPersonEventCardText(d.data, 'death')}`,
        boxWidthTotal(d)
      )
    )

  // images
  nodes
    .filter(d => d.imageUrl)
    .append('circle')
    .attr('r', imgRadius)
    .attr('cy', imgRadius + imgPadding)
    .attr('cx', imgRadius + imgPadding)
    .attr('fill', d => `url(#imgpattern-${d.handle})`)

  const defs = targetsvg.append('defs')
  const imgPattern = defs
    .selectAll('.imgpattern')
    .data(nodedata)
    .enter()
    .filter(d => d.nodetype === 'person' && d.imageUrl)
    .append('pattern')
    .attr('id', d => `imgpattern-${d.handle}`)
    .attr('height', 1)
    .attr('width', 1)
    .attr('x', '0')
    .attr('y', '0')

  imgPattern
    .append('image')
    .attr('x', 0)
    .attr('y', 0)
    .attr('height', 70)
    .attr('width', 70)
    .attr('xlink:href', d => d.imageUrl)

  const markerY = boxHeight / 2 - 10
  const familyMarkerY = d => markerY + d.unionOffset
  const familyNodes = nodes.filter(d => d.nodetype === 'family')
  const dataByType = type =>
    new Map(nodedata.filter(d => d.nodetype === type).map(d => [d.handle, d]))
  const familyData = dataByType('family')
  const personData = dataByType('person')
  const deceasedSide = d => {
    if (!d.deceasedPartner) return undefined
    return personData.get(d.deceasedPartner).xCoord < d.xCoord
      ? 'left'
      : 'right'
  }
  const familyIsInteractive = d => d.grampsId && !canEdit

  familyNodes
    .attr('class', d => `node family union-${d.status}`)
    .attr('role', d => (familyIsInteractive(d) ? 'link' : null))
    .attr('tabindex', d => (familyIsInteractive(d) ? 0 : null))
    .attr('aria-label', d => unionLabel(d.status))
    .style('cursor', d => (familyIsInteractive(d) ? 'pointer' : 'default'))
    .append('title')
    .text(d => unionLabel(d.status))

  familyNodes
    .append('circle')
    .attr('class', 'family-hit-target')
    .attr('r', 16)
    .attr('cy', familyMarkerY)
    .attr('fill', 'transparent')
    .attr('pointer-events', 'all')

  familyNodes.each(function (d) {
    const visual = getUnionVisualCode(d.status)
    select(this)
      .append('g')
      .attr('transform', `translate(0 ${familyMarkerY(d)})`)
      .selectAll('path')
      .data(getUnionMarkerPaths(visual, deceasedSide(d)))
      .join('path')
      .attr('class', marker => marker.className)
      .attr('d', marker => marker.d)
      .attr('fill', marker => marker.fill)
      .attr('stroke', marker => marker.stroke)
      .attr('stroke-width', marker => marker.strokeWidth)
      .attr('stroke-linecap', marker => marker.strokeLinecap)
      .attr('stroke-linejoin', marker => marker.strokeLinejoin)
  })

  const openFamily = d =>
    fireEvent(window, 'nav', {path: `family/${d.grampsId}`})
  familyNodes
    .filter(familyIsInteractive)
    .on('click', (event, d) => openFamily(d))
    .on('keydown', (event, d) => {
      if (!['Enter', ' '].includes(event.key)) return
      event.preventDefault()
      openFamily(d)
    })
    .on('mouseenter', function (event, d) {
      showPreview(this, 'family', d.grampsId)
    })
    .on('mouseleave', hidePreview)

  nodes
    .filter(d => d.nodetype === 'person')
    .style('cursor', canEdit ? 'default' : 'pointer')
    .on('click', canEdit ? null : clicked)
    .on('mouseenter', function (event, d) {
      if (!canEdit) showPreview(this, 'person', d.profile?.gramps_id)
    })
    .on('mouseleave', hidePreview)

  if (canEdit) {
    appendAddPersonButton(
      nodes.filter(d => d.nodetype === 'person'),
      boxWidth - 14,
      14,
      d => d.handle
    )
  }

  const linkGenerator = linkVertical()
    .x(d => d.x)
    .y(d => d.y)
  let unionGradientIndex = 0
  // copy edges
  gvchartx.selectAll('.edge').each(function () {
    const edge = select(this)
    const edgeClass = edge.attr('class') ?? ''
    const pathData = edge.select('path').attr('d')
    // extract points from path data
    const points = pathData
      ?.match(/-?[\d.]+,-?[\d.]+/g) // Find all "x,y" pairs
      ?.map(d => d.split(',').map(Number)) // Convert to [x, y] arrays
    if (!points || points.length < 2)
      throw new Error(`Invalid Graphviz edge path: ${pathData}`)
    // we use only the start and end point
    const firstPoint = points[0]
    const lastPoint = points.at(-1)
    // we replace the polyline with a smooth connector from start to end
    const personHandle = edgeClass.match(/union_person_([^\s]+)/)?.[1]
    const familyHandle = edgeClass.match(/union_family_([^\s]+)/)?.[1]
    const descentFamilyHandle = edgeClass.match(/descent_family_([^\s]+)/)?.[1]
    const isUnion = edgeClass.includes('union_edge')
    const targetPoint = {
      x: lastPoint[0],
      y: lastPoint[1],
    }
    let edgePath = linkGenerator({
      source: {x: firstPoint[0], y: firstPoint[1]},
      target: targetPoint,
    })
    let stroke = 'var(--grampsjs-body-font-color-40)'
    let strokeWidth = 1
    let strokeDash = null

    if (isUnion) {
      const person = graph.known(personHandle)
      const family = graph.getNode(familyHandle)
      const familyDatum = familyData.get(familyHandle)
      const personDatum = personData.get(personHandle)
      const y = familyDatum.yCoord + familyMarkerY(familyDatum)
      const direction = Math.sign(
        familyDatum.xCoord - (personDatum.xCoord + boxWidth / 2)
      )
      const personX = personDatum.xCoord + (direction > 0 ? boxWidth : 0)
      const familyX = familyDatum.xCoord
      edgePath = `M ${familyX},${y} L ${personX},${y}`
      stroke = genderColor[person.profile?.sex] ?? genderColor.U
      strokeWidth = unionLineStrokeWidth
      strokeDash = getUnionVisualCode(family.status).lineDash
      const left = Math.min(personX, familyX)
      const right = Math.max(personX, familyX)
      const crossedPeople = [...personData.values()].filter(
        other =>
          other.handle !== family.father &&
          other.handle !== family.mother &&
          y >= other.yCoord &&
          y <= other.yCoord + boxHeight &&
          other.xCoord - genderStripLeftOverflow < right &&
          other.xCoord + boxWidth > left
      )
      if (crossedPeople.length) {
        const gradientId = `union-edge-gradient-${unionGradientIndex++}`
        const gradient = defs
          .append('linearGradient')
          .attr('id', gradientId)
          .attr('class', 'union-occlusion-gradient')
          .attr('gradientUnits', 'userSpaceOnUse')
          .attr('x1', left)
          .attr('x2', right)
        const stops = [
          {x: left, opacity: 1},
          ...crossedPeople.flatMap(other => {
            const cardLeft = Math.max(
              left,
              other.xCoord - genderStripLeftOverflow
            )
            const cardRight = Math.min(right, other.xCoord + boxWidth)
            return [
              {x: Math.max(left, cardLeft - 44), opacity: 1},
              {x: cardLeft, opacity: 0.2},
              {x: cardRight, opacity: 0.2},
              {x: Math.min(right, cardRight + 44), opacity: 1},
            ]
          }),
          {x: right, opacity: 1},
        ].toSorted((a, b) => a.x - b.x)
        for (const stop of stops)
          gradient
            .append('stop')
            .attr('offset', (stop.x - left) / (right - left))
            .attr('stop-color', stroke)
            .attr('stop-opacity', stop.opacity)
        stroke = `url(#${gradientId})`
      }
    } else if (descentFamilyHandle) {
      const familyDatum = familyData.get(descentFamilyHandle)
      const y = familyDatum.yCoord + familyMarkerY(familyDatum)
      edgePath = linkGenerator({
        source: {x: familyDatum.xCoord, y},
        target: targetPoint,
      })
    }
    edges
      .append('path')
      .attr('class', isUnion ? 'edge union-edge' : 'edge descent-edge')
      .attr('data-family-handle', familyHandle ?? descentFamilyHandle)
      .attr('data-person-handle', personHandle)
      .attr('d', edgePath)
      .attr('fill', 'none')
      .attr('stroke', stroke)
      .attr('stroke-width', strokeWidth)
      .attr('stroke-dasharray', strokeDash)
  })
  // edges.selectAll('path').attr('stroke-opacity', '0.4')

  // move root person to center
  nodes
    .filter(d => d.handle === graph.rootPerson?.handle)
    .each(d => {
      const rpc = {
        x: -1 * d.xCoord - boxWidth / 2,
        y: -1 * d.yCoord - boxHeight / 2,
      }
      targetsvg.attr('transform', `translate(${rpc.x} ${rpc.y})`)
    })

  // highlight root person
  nodes
    .filter(d => d.handle === graph.rootPerson?.handle)
    .style(
      'filter',
      'drop-shadow(0 3px 8px var(--grampsjs-body-font-color-30))'
    )

  // kill hidden graphviz generated svg
  gvchartx.remove()
}

export function RelationshipChart(
  data,
  {
    bboxWidth = 300,
    bboxHeight = 150,
    boxWidth = 190,
    boxHeight = 90,
    imgPadding = 10,
    getImageUrl = null,
    grampsId = 0,
    maxImages = 50,
    shrinkToFit = false,
    // orientation = 'LTR',
    nameDisplayFormat = chartNameDisplayFormat.surnameThenGiven,
    canEdit = false,
    initialZoom = null,
    unionLabel = status => status,
  }
) {
  const resultnode = create('div').style('width', '100%')
  const divhidden = resultnode.append('div').style('display', 'none')
  const svg = resultnode
    .append('svg')
    .call(
      zoom().on('zoom', e =>
        svg.select('#chart-content').attr('transform', e.transform)
      )
    )
    .attr('font-family', 'Inter var')
    .attr('font-size', 13)

  const chartContent = svg.append('g').attr('id', 'chart-content')

  if (initialZoom) {
    svg.node().__zoom = initialZoom
    chartContent.attr('transform', initialZoom.toString())
  }
  const graph = new Relgraph(data, boxWidth, boxHeight, grampsId)
  const dot = graph.getDot()
  Graphviz.load().then(graphviz => {
    graphviz.dot(dot)
    divhidden.html(graphviz.layout(dot, 'svg', 'dot'))
    remasterChart(
      divhidden,
      chartContent.append('g'),
      graph,
      boxWidth,
      boxHeight,
      imgPadding,
      getImageUrl,
      maxImages,
      nameDisplayFormat,
      canEdit,
      unionLabel
    )
    svg.attr('viewBox', [
      -bboxWidth / 2,
      -bboxHeight / 2,
      bboxWidth,
      bboxHeight,
    ])
    if (shrinkToFit) {
      const bbox = svg.node().getBBox()
      if (bbox.height > bboxHeight) {
        svg
          .attr('viewBox', [bbox.x, bbox.y - 20, bbox.width, bbox.height + 40])
          .attr('height', bboxHeight)
          .attr('width', bboxWidth)
      }
    }
  })

  return svg.node()
}
