import {describe, expect, it} from 'vitest'

import {getPersonEventCardText} from '../../src/charts/util.js'

describe('getPersonEventCardText', () => {
  it('returns null when the event does not exist', () => {
    expect(getPersonEventCardText({profile: {}}, 'birth')).toBeNull()
  })

  it('uses the formatted date when it is available', () => {
    const person = {
      profile: {birth: {date: '12 May 1980'}},
      birth_ref_index: 0,
      extended: {events: [{description: 'Eldest'}]},
    }
    expect(getPersonEventCardText(person, 'birth')).toBe('12 May 1980')
  })

  it('falls back to the event description when the date is empty', () => {
    const person = {
      profile: {birth: {date: ''}},
      birth_ref_index: 1,
      extended: {events: [{description: 'Other'}, {description: 'Eldest'}]},
    }
    expect(getPersonEventCardText(person, 'birth')).toBe('Eldest')
  })

  it('returns an empty string when the event exists without details', () => {
    const person = {
      profile: {death: {date: '', type: 'Death'}},
      death_ref_index: 0,
      extended: {events: [{description: ''}]},
    }
    expect(getPersonEventCardText(person, 'death')).toBe('')
  })
})
