import {describe, expect, it} from 'vitest'

import {
  GrampsjsEvents,
  getEventTitle,
  getEventType,
  isBirthEvent,
} from '../../src/components/GrampsjsEvents.js'

describe('event list presentation', () => {
  it('prefers the event-page title and never falls back to a reordered name', () => {
    const events = new GrampsjsEvents()
    events.appState = {
      i18n: {strings: {}},
    }
    const listEvent = {
      handle: 'event-1',
      profile: {
        type: 'Birth',
        summary: 'Birth - Example, Alex',
      },
    }

    events.eventProfiles = {}
    expect(events._getPrimaryText(listEvent)).toBe('Birth')

    events.eventProfiles = {
      'event-1': {
        type: 'Birth',
        participants: {
          people: [
            {
              role: 'Primary',
              person: {name_given: 'Alex', name_surname: 'Example'},
            },
          ],
          families: [],
        },
      },
    }
    expect(events._getPrimaryText(listEvent)).toBe('Birth: Alex Example')
  })

  it('uses the complete event summary when requested', () => {
    expect(
      getEventTitle(
        {
          type: 'Marriage',
          role: 'Family',
          summary: 'Marriage - Alex Example and Taylor Sample',
        },
        true
      )
    ).toBe('Marriage: Alex Example and Taylor Sample')
  })

  it('translates fallback event types and keeps informative localized roles', () => {
    const translate = key =>
      ({Birth: 'Birth event', Child: 'Child role'}[key] || key)
    expect(getEventTitle({type: 'Birth', role: 'Child'}, true, translate)).toBe(
      'Birth event (Child role)'
    )
    expect(
      getEventTitle({type: 'Birth', role: 'Primary'}, true, translate)
    ).toBe('Birth event')
  })

  it('recognizes birth events with serialized Gramps types', () => {
    expect(getEventType({type: {string: 'Birth'}})).toBe('Birth')
    expect(getEventType({type: {value: 'Death'}})).toBe('Death')
    expect(isBirthEvent({type: 'Birth'})).toBe(true)
    expect(isBirthEvent({type: {string: 'Death'}})).toBe(false)
  })
})
