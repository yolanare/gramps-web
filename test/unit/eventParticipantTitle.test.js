import {describe, expect, it} from 'vitest'

import {eventParticipantTitle} from '../../src/components/eventParticipantTitle.js'

const translate = key => key

describe('event participant titles', () => {
  it('uses the same given-name-first person title as the event page', () => {
    expect(
      eventParticipantTitle(
        {
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
        translate
      )
    ).toBe('Birth: Alex Example')
  })

  it('uses both family participants in the event-page order', () => {
    expect(
      eventParticipantTitle(
        {
          type: 'Marriage',
          participants: {
            people: [],
            families: [
              {
                role: 'Family',
                family: {
                  father: {name_given: 'Alex', name_surname: 'Example'},
                  mother: {name_given: 'Taylor', name_surname: 'Sample'},
                },
              },
            ],
          },
        },
        translate
      )
    ).toBe('Marriage: Alex Example & Taylor Sample')
  })
})
