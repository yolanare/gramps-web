import {html} from 'lit'

import {GrampsjsViewObject} from './GrampsjsViewObject.js'
import {fireEvent} from '../util.js'
import '../components/GrampsjsPerson.js'

const EVENT_PROFILE_BATCH_SIZE = 50

export class GrampsjsViewPerson extends GrampsjsViewObject {
  static get properties() {
    return {
      homePersonDetails: {type: Object},
      _timelineData: {type: Array},
      _timelineLoading: {type: Boolean},
      _eventProfiles: {type: Object},
    }
  }

  constructor() {
    super()
    this.homePersonDetails = {}
    this._className = 'person'
    this._timelineData = []
    this._timelineLoading = false
    this._eventProfiles = {}
    this._eventProfileGeneration = 0
    this._boundHandleTimelineNeeded = this._handleTimelineNeeded.bind(this)
  }

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener(
      'person:timeline-needed',
      this._boundHandleTimelineNeeded
    )
  }

  disconnectedCallback() {
    this.removeEventListener(
      'person:timeline-needed',
      this._boundHandleTimelineNeeded
    )
    super.disconnectedCallback()
  }

  _clearData() {
    super._clearData()
    this._timelineData = []
    this._timelineLoading = false
    this._eventProfiles = {}
    this._eventProfileGeneration += 1
  }

  _handleTimelineNeeded() {
    if (!this._timelineData.length && !this._timelineLoading) {
      this._fetchTimeline()
    }
  }

  _fetchTimeline() {
    const handle = this._data?.handle
    if (!handle) return
    this._timelineLoading = true
    const url = `/api/people/${handle}/timeline?locale=${
      this.appState.i18n.lang || 'en'
    }&precision=2`
    this.appState.apiGet(url).then(result => {
      this._timelineLoading = false
      if ('data' in result) {
        this._timelineData = result.data
        this._fetchEventProfiles(result.data.map(event => event.handle))
      } else if ('error' in result) {
        fireEvent(this, 'grampsjs:error', {message: result.error})
      }
    })
  }

  _handleObjectLoaded(data) {
    this._eventProfiles = {}
    this._eventProfileGeneration += 1
    const familyEventHandles = [
      ...(data?.extended?.families || []),
      ...(data?.extended?.parent_families || []),
    ].flatMap(family =>
      (family.event_ref_list || []).map(eventRef => eventRef.ref)
    )
    this._fetchEventProfiles([
      ...(data?.extended?.events || []).map(event => event.handle),
      ...familyEventHandles,
      ...this._timelineData.map(event => event.handle),
    ])
  }

  async _fetchEventProfiles(handles) {
    const locale = this.appState.i18n.lang || 'en'
    const missingHandles = [
      ...new Set(handles.filter(handle => !this._eventProfiles[handle])),
    ]
    if (missingHandles.length === 0) return

    const generation = this._eventProfileGeneration
    const requests = []
    for (let i = 0; i < missingHandles.length; i += EVENT_PROFILE_BATCH_SIZE) {
      const batch = missingHandles.slice(i, i + EVENT_PROFILE_BATCH_SIZE)
      requests.push(
        this.appState.apiGet(
          `/api/events/?handles=${batch.join(',')}&profile=all&locale=${locale}`
        )
      )
    }
    const results = await Promise.all(requests)
    if (generation !== this._eventProfileGeneration) {
      return
    }
    const error = results.find(result => 'error' in result)?.error
    if (error) {
      fireEvent(this, 'grampsjs:error', {message: error})
      return
    }
    const events = results.flatMap(result => result.data)
    this._eventProfiles = {
      ...this._eventProfiles,
      ...Object.fromEntries(events.map(event => [event.handle, event.profile])),
    }
  }

  getUrl() {
    return `/api/people/?gramps_id=${this.grampsId}&locale=${
      this.appState.i18n.lang || 'en'
    }&profile=all&backlinks=true&extend=all&precision=1`
  }

  renderElement() {
    return html`
      <grampsjs-person
        .data=${this._data}
        .appState="${this.appState}"
        .homePersonDetails=${this.homePersonDetails}
        .timelineData=${this._timelineData}
        .eventProfiles=${this._eventProfiles}
        ?edit="${this.edit}"
        ?canEdit="${this.canEdit}"
      ></grampsjs-person>
    `
  }
}

window.customElements.define('grampsjs-view-person', GrampsjsViewPerson)
