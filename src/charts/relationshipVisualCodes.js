export const unionStatus = {
  married: 'married',
  divorced: 'divorced',
  partners: 'partners',
  unknown: 'unknown',
}

export const genderColor = {
  F: 'var(--color-girl)',
  M: 'var(--color-boy)',
  X: 'var(--color-other)',
  U: 'var(--color-unknown)',
}

export const unionLineStrokeWidth = 2.5

const strongMarker = 'var(--grampsjs-body-font-color-78)'
const mutedMarker = 'var(--grampsjs-body-font-color-50)'
const markerFill = 'var(--md-sys-color-surface)'
const deathMark = {
  stroke: strongMarker,
  strokeWidth: 2,
  stemHalfLength: 5,
  crossbarHalfLength: 3,
  crossbarOffset: -1.5,
}

const unionStatusByFamilyType = [
  unionStatus.married,
  unionStatus.partners,
  unionStatus.partners,
  unionStatus.unknown,
]

const unionStatusByRelationship = {
  married: unionStatus.married,
  unmarried: unionStatus.partners,
  'civil union': unionStatus.partners,
}

const normalizeRelationship = value =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export function getFamilyUnionStatus(family) {
  const profile = family.profile ?? family
  const rawType = profile.type ?? family.type
  const relationship = normalizeRelationship(
    (typeof rawType === 'string' ? rawType : rawType?.string) ??
      profile.relationship ??
      family.relationship
  )

  if (relationship.startsWith('divorc')) return unionStatus.divorced
  if (Object.keys(profile.divorce ?? family.divorce ?? {}).length)
    return unionStatus.divorced
  return (
    unionStatusByFamilyType[rawType?.value] ??
    unionStatusByRelationship[relationship] ??
    unionStatus.unknown
  )
}

const path = (className, d, stroke, strokeWidth, fill = markerFill) => ({
  className,
  d,
  fill,
  stroke,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth,
})

const ringPath = (x, radius) =>
  `M ${x - radius} 0 A ${radius} ${radius} 0 1 0 ${
    x + radius
  } 0 A ${radius} ${radius} 0 1 0 ${x - radius} 0 Z`

const diamondPath = radius =>
  `M 0 ${-radius} L ${radius} 0 L 0 ${radius} L ${-radius} 0 Z`

const ring = (x, radius, stroke, strokeWidth) => {
  const deathSide = x < 0 ? 'left' : x > 0 ? 'right' : 'center'
  return {
    ...path(
      `union-ring union-ring-${deathSide}`,
      ringPath(x, radius),
      stroke,
      strokeWidth
    ),
    deathSide,
    deathX: x,
  }
}

const diamond = (radius, stroke, strokeWidth) => ({
  ...path('union-diamond', diamondPath(radius), stroke, strokeWidth),
  deathSide: 'center',
  deathX: 0,
})

export const unionVisualCodes = {
  [unionStatus.married]: {
    label: 'Married',
    markerPaths: [
      ring(-5, 6.5, strongMarker, 2),
      ring(5, 6.5, strongMarker, 2),
    ],
    lineDash: null,
  },
  [unionStatus.divorced]: {
    label: 'Divorced',
    markerPaths: [
      ring(-6, 5, mutedMarker, 1.5),
      ring(6, 5, mutedMarker, 1.5),
      path('union-divorce-slash', 'M -7 7 L 7 -7', strongMarker, 2, 'none'),
    ],
    lineDash: null,
  },
  [unionStatus.partners]: {
    label: 'Unmarried',
    markerPaths: [ring(0, 7, strongMarker, 2)],
    lineDash: '7 5',
  },
  [unionStatus.unknown]: {
    label: 'Unknown',
    markerPaths: [diamond(7, mutedMarker, 2)],
    lineDash: '2 5',
  },
}

export const getUnionVisualCode = status =>
  unionVisualCodes[status] ?? unionVisualCodes[unionStatus.unknown]

export function getUnionMarkerPaths(visual, deceasedSide) {
  if (!deceasedSide) return visual.markerPaths
  const deceasedMarker =
    visual.markerPaths.find(marker => marker.deathSide === deceasedSide) ??
    visual.markerPaths.find(marker => marker.deathSide === 'center')
  return [
    ...visual.markerPaths.map(marker =>
      marker === deceasedMarker ? {...marker, stroke: mutedMarker} : marker
    ),
    path(
      'union-death-mark',
      `M ${deceasedMarker.deathX} ${-deathMark.stemHalfLength} V ${
        deathMark.stemHalfLength
      } M ${deceasedMarker.deathX - deathMark.crossbarHalfLength} ${
        deathMark.crossbarOffset
      } H ${deceasedMarker.deathX + deathMark.crossbarHalfLength}`,
      deathMark.stroke,
      deathMark.strokeWidth,
      'none'
    ),
  ]
}
