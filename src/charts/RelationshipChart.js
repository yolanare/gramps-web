import {create, select} from 'd3-selection'
import {zoom} from 'd3-zoom'
import {linkVertical} from 'd3-shape'
import {Graphviz} from '@hpcc-js/wasm'
import {chartNameDisplayFormat} from '../util.js'
import {appendAddPersonButton} from './addPersonButton.js'
import {getPersonEventCardText} from './util.js'

const sexColor = {
  F: 'var(--color-girl)',
  M: 'var(--color-boy)',
  X: 'var(--color-other)',
  U: 'var(--color-unknown)',
}

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

function orderFamilyGroup(group) {
  const familiesByPerson = new Map()
  for (const family of group.families) {
    for (const person of [family.father, family.mother]) {
      const personFamilies = familiesByPerson.get(person) ?? []
      personFamilies.push(family)
      familiesByPerson.set(person, personFamilies)
    }
  }

  const root = [...group.persons].reduce((current, person) =>
    (familiesByPerson.get(person)?.length ?? 0) >
    (familiesByPerson.get(current)?.length ?? 0)
      ? person
      : current
  )
  const visitedFamilies = new Set()
  const visitedPersons = new Set([root])

  const branchesFrom = person => {
    const branches = []
    for (const family of familiesByPerson.get(person) ?? []) {
      if (visitedFamilies.has(family.handle)) continue
      visitedFamilies.add(family.handle)
      const branch = [{type: 'family', handle: family.handle}]
      const partner = family.father === person ? family.mother : family.father
      if (!visitedPersons.has(partner)) {
        visitedPersons.add(partner)
        branch.push({type: 'person', handle: partner})
        for (const nestedBranch of branchesFrom(partner)) {
          branch.push(...nestedBranch)
        }
      }
      branches.push(branch)
    }
    return branches
  }

  const branches = branchesFrom(root)
  const ordered = []
  const leftBranchCount = Math.ceil(branches.length / 2)
  for (const branch of branches.slice(0, leftBranchCount)) {
    ordered.push(...branch.toReversed())
  }
  ordered.push({type: 'person', handle: root})
  for (const branch of branches.slice(leftBranchCount)) ordered.push(...branch)

  const orderedPeople = ordered.filter(item => item.type === 'person')
  const personPositions = new Map(
    orderedPeople.map((item, index) => [item.handle, index])
  )
  const familiesAfterPerson = new Map()
  for (const family of group.families) {
    const earlierPerson =
      personPositions.get(family.father) < personPositions.get(family.mother)
        ? family.father
        : family.mother
    const families = familiesAfterPerson.get(earlierPerson) ?? []
    families.push({type: 'family', handle: family.handle})
    familiesAfterPerson.set(earlierPerson, families)
  }

  return orderedPeople.flatMap(person => [
    person,
    ...(familiesAfterPerson.get(person.handle) ?? []),
  ])
}

const personNodeId = handle => `person_${handle}`
const familyNodeId = handle => `family_${handle}`

function generateDot(graph) {
  let dot = ''

  const groupedPeople = new Set()
  const familyGroups = getPartnerFamilyGroups(graph.getNodes())
  for (const [groupIndex, group] of familyGroups.entries()) {
    for (const person of group.persons) groupedPeople.add(person)
    const ordered = orderFamilyGroup(group)
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
        dot += `
        "${personNodeId(item.handle)}" [
          class="person_${item.handle}"
          margin=0.25
          shape="none"
          fixedsize=true
          width=${graph.boxWidth / 66}
          height=${graph.boxHeight / 66 - 0.3}
          label=<->
        ]
        `
      } else {
        dot += `
        "${familyNodeId(item.handle)}" [
          class="family_${item.handle}"
          label=<.>
          shape="none"
          margin=0
          fixedsize=true
          width=0.1
          height=${graph.boxHeight / 66 - 0.3}
        ]
        `
      }
    }
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]
      const current = ordered[index]
      const previousId =
        previous.type === 'person'
          ? personNodeId(previous.handle)
          : familyNodeId(previous.handle)
      const currentId =
        current.type === 'person'
          ? personNodeId(current.handle)
          : familyNodeId(current.handle)
      dot += `"${previousId}" -> "${currentId}" [style=invis, constraint=false, weight=1000]
      `
    }
    dot += '}}'

    for (const family of group.families) {
      const familyId = familyNodeId(family.handle)
      dot += `
      "${personNodeId(
        family.father
      )}" -> "${familyId}" [tailport=s, headport=s, constraint=false, label="", arrowhead=none, color="#555"]
      "${familyId}" -> "${personNodeId(
        family.mother
      )}" [tailport=s, headport=s, constraint=false, label="", arrowhead=none, color="#555"]
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
        "${personNodeId(person.handle)}" [
          class="person_${person.handle}"
          margin=0.25
          shape="none"
          fixedsize=true
          width=${graph.boxWidth / 66}
          height=${graph.boxHeight / 66 - 0.3}
          label=<->
        ]
      }
    `
  }

  // Parent-child edges preserve the original family or single-parent source.
  for (const e of graph.getEdges()) {
    const source = e.sourcePerson
      ? personNodeId(e.sourcePerson)
      : familyNodeId(e.sourceFamily)
    dot += `"${source}" -> "${personNodeId(
      e.targetPerson
    )}" [label="", arrowhead=none, color="#555"]
      `
  }

  // frame dot code with global commands
  dot = `
    digraph gramps {
      compound=true
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

  addNode(fdata, family, father, mother) {
    const n = {
      handle: family,
      type: fdata?.type,
      fake: fdata?.fake,
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
  canEdit = false
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
        xCoord: x - boxWidth / 2 + 4,
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
        xCoord: x,
        yCoord: y,
        type: d.type,
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
    .attr('fill', d => sexColor[d.profile?.sex] ?? 'var(--color-unknown)')
    .attr('width', 24)
    .attr('height', boxHeight - 1)
    .attr('x', -4)
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

  nodes
    .filter(d => d.type === 'Married' && d.nodetype === 'family')
    .append('circle')
    .attr('class', 'married')
    .attr('r', 6)
    .attr('cy', boxHeight / 2 - 10)
    .attr('stroke', 'var(--grampsjs-body-font-color-40)')
    .attr('fill', 'var(--grampsjs-color-shade-220)')

  nodes
    .filter(d => d.type === 'Married' && d.nodetype === 'family')
    .insert('line', ':first-child')
    .attr('class', 'married')
    .attr('x1', -11)
    .attr('x2', 11)
    .attr('y1', boxHeight / 2 - 10)
    .attr('y2', boxHeight / 2 - 10)
    .attr('stroke', 'var(--grampsjs-body-font-color-40)')
    .attr('stroke-width', 1)

  nodes
    .filter(d => d.nodetype === 'person')
    .style('cursor', canEdit ? 'default' : 'pointer')
    .on('click', canEdit ? null : clicked)
    .on('mouseenter', function (event, d) {
      if (canEdit) return
      if (window.matchMedia('(hover: none)').matches) return
      const grampsId = d.profile?.gramps_id
      if (!grampsId) return
      window.dispatchEvent(
        new CustomEvent('object:preview-show', {
          detail: {
            objectType: 'person',
            grampsId,
            anchorRect: this.getBoundingClientRect(),
          },
        })
      )
    })
    .on('mouseleave', () => {
      if (window.matchMedia('(hover: none)').matches) return
      window.dispatchEvent(new CustomEvent('object:preview-hide'))
    })

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
  // copy edges
  gvchartx.selectAll('.edge').each(function () {
    const path = select(this).select('path')
    const pathData = path.attr('d')
    // extract points from path data
    const points = pathData
      ?.match(/-?[\d.]+,-?[\d.]+/g) // Find all "x,y" pairs
      ?.map(d => d.split(',').map(Number)) // Convert to [x, y] arrays
    if (!points || points.length < 2) {
      return
    }
    // we use only the start and end point
    const firstAndLastPoint = [points[0], points[points.length - 1]]
    // we replace the polyline with a smooth connector from start to end
    edges
      .append('path')
      .attr('class', 'edge')
      .attr(
        'd',
        linkGenerator({
          source: {x: firstAndLastPoint[0][0], y: firstAndLastPoint[0][1]},
          target: {x: firstAndLastPoint[1][0], y: firstAndLastPoint[1][1]},
        })
      )
      .attr('fill', 'none')
      .attr('stroke', 'var(--grampsjs-body-font-color-40)')
      .attr('stroke-width', 1)
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
      canEdit
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
