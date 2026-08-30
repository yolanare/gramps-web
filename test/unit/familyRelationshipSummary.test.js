import {describe, expect, it} from 'vitest'

import {
  getFamilyRelationshipSummary,
  hasFamilyRelationshipSummary,
} from '../../src/components/familyRelationshipSummary.js'

describe('family relationship summary', () => {
  it('returns no content for an empty family profile', () => {
    expect(hasFamilyRelationshipSummary({})).toBe(false)
  })

  it('keeps the relationship type', () => {
    expect(
      getFamilyRelationshipSummary({relationship: 'Unmarried'}).relationship
    ).toBe('Unmarried')
  })

  it('keeps marriage and divorce dates and places', () => {
    const summary = getFamilyRelationshipSummary({
      marriage: {
        date: '1931-10-21',
        place: 'Long place name',
        place_name: 'Montigny-en-Gohelle',
      },
      divorce: {date: '1940-03-20', place: 'Lens'},
    })

    expect(summary.marriage).toEqual({
      date: '1931-10-21',
      place: 'Montigny-en-Gohelle',
    })
    expect(summary.divorce).toEqual({date: '1940-03-20', place: 'Lens'})
  })

  it('ignores an empty marriage profile', () => {
    expect(getFamilyRelationshipSummary({marriage: {}}).marriage).toBeNull()
  })
})
