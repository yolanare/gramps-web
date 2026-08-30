import {beforeAll, describe, expect, it} from 'vitest'

let GrampsjsPerson

function templateText(value) {
  if (Array.isArray(value)) {
    return value.map(templateText).join('')
  }
  if (!value?.strings) {
    return value == null ? '' : String(value)
  }
  return value.strings
    .map((part, index) => `${part}${templateText(value.values[index])}`)
    .join('')
}

beforeAll(async () => {
  globalThis.ResizeObserver ||= class {
    observe() {}

    disconnect() {}
  }
  ;({GrampsjsPerson} = await import('../../src/components/GrampsjsPerson.js'))
})

describe('person profile layout', () => {
  it('renders relationships separately from the main sections', () => {
    const person = new GrampsjsPerson()
    person.appState = {i18n: {strings: {}}}
    person.data = {
      handle: 'person-1',
      gramps_id: 'I0001',
      gender: 0,
      family_list: ['family-1'],
      parent_family_list: [],
      event_ref_list: [{ref: 'event-1'}],
      media_list: [],
      person_ref_list: [],
      backlinks: {},
      profile: {
        events: [{type: 'Birth'}],
      },
      extended: {
        events: [{handle: 'event-1', type: 'Birth'}],
        families: [],
        parent_families: [],
        tags: [],
      },
    }
    person.renderSection = key => `[${key}]`

    const markup = templateText(person.renderSections())
    expect(markup).toMatch(
      /content-side[^]*\[relationships\][^]*content-main[^]*\[events\]/
    )
  })

  it('keeps combined event profiles chronological and translated', () => {
    const person = new GrampsjsPerson()
    person.appState = {
      i18n: {strings: {Birth: 'Birth event', Marriage: 'Marriage event'}},
    }
    person._showFamilyEvents = true
    person._showRelatedEvents = true
    person.data = {
      extended: {
        events: [{handle: 'birth-self', type: 'Birth'}],
        families: [
          {
            handle: 'family-1',
            event_ref_list: [{ref: 'marriage-self'}],
          },
        ],
        parent_families: [
          {
            handle: 'family-parents',
            event_ref_list: [{ref: 'marriage-parents'}],
          },
        ],
      },
      profile: {
        events: [{type: 'Birth event'}],
      },
    }
    person.timelineData = [
      {handle: 'birth-self', age: '0 days'},
      {handle: 'marriage-self', type: 'Marriage'},
      {handle: 'marriage-parents', type: 'Marriage'},
      {
        handle: 'birth-child',
        type: 'Birth',
      },
    ]

    const {profile} = person._getCombinedTimelineEvents()
    expect(profile.map(event => event.type)).toEqual([
      'Birth event',
      'Marriage event',
      'Marriage event',
      'Birth event',
    ])
    expect(profile.every(event => event.context === undefined)).toBe(true)
  })
})
