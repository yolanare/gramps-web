import {html, css, svg} from 'lit'

import {GrampsjsViewTreeChartBase} from './GrampsjsViewTreeChartBase.js'
import '../components/GrampsjsRelationshipChart.js'
import '../components/GrampsjsTreeChartAddPerson.js'
import {
  genderColor,
  getUnionMarkerPaths,
  unionLineStrokeWidth,
  unionVisualCodes,
} from '../charts/relationshipVisualCodes.js'

const legendMarkerX = 35
const legendMarkerY = 11

const renderUnionSample = (visual, deceasedSide) => html`
  <svg
    class="legend-sample union-sample"
    viewBox="0 0 70 22"
    aria-hidden="true"
  >
    ${[
      ['male-line', legendMarkerX, 1, genderColor.M],
      ['female-line', legendMarkerX, 69, genderColor.F],
    ].map(
      ([className, x1, x2, stroke]) => svg`<line
        class="${className}"
        x1="${x1}"
        x2="${x2}"
        y1="${legendMarkerY}"
        y2="${legendMarkerY}"
        stroke="${stroke}"
        stroke-width="${unionLineStrokeWidth}"
        stroke-dasharray="${visual.lineDash ?? ''}"
      ></line>`
    )}
    <g transform="translate(${legendMarkerX} ${legendMarkerY})">
      ${getUnionMarkerPaths(visual, deceasedSide).map(
        marker => svg`<path
          class="${marker.className}"
          d="${marker.d}"
          fill="${marker.fill}"
          stroke="${marker.stroke}"
          stroke-width="${marker.strokeWidth}"
          stroke-linecap="${marker.strokeLinecap}"
          stroke-linejoin="${marker.strokeLinejoin}"
        ></path>`
      )}
    </g>
  </svg>
`

export class GrampsjsViewRelationshipChart extends GrampsjsViewTreeChartBase {
  static get styles() {
    return [
      super.styles,
      css`
        :host {
          margin: 0;
        }
        .relationship-legend {
          border-top: 1px solid var(--grampsjs-body-font-color-15);
          container-type: inline-size;
          margin-top: 18px;
          padding-top: 12px;
        }
        .relationship-legend h3 {
          font-size: 1rem;
          margin: 0 0 8px;
        }
        .legend-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px 16px;
        }
        .legend-item {
          display: grid;
          grid-template-columns: 70px minmax(0, 1fr);
          gap: 10px;
          align-items: center;
          min-width: 0;
        }
        .legend-sample {
          height: 22px;
          width: 70px;
          overflow: visible;
        }
        .legend-sample .descent-sample {
          fill: none;
          stroke: var(--grampsjs-body-font-color-40);
          stroke-width: 1;
        }
        .legend-note {
          color: var(--grampsjs-body-font-color-70);
          font-size: 0.85rem;
          margin: 10px 0 0;
          max-width: 32rem;
        }
        @container (max-width: 400px) {
          .legend-grid {
            grid-template-columns: 1fr;
          }
        }
      `,
    ]
  }

  constructor() {
    super()
    this._setSep = true
    this._setMaxImages = true
    this.color = ''
    this.defaults.nAnc = 2
  }

  get nAnc() {
    return this.appState?.settings?.relationshipChartAnc ?? this.defaults.nAnc
  }

  set nAnc(value) {
    this.appState.updateSettings({relationshipChartAnc: value}, false)
  }

  get nMaxImages() {
    return (
      this.appState?.settings?.relationshipChartMaxImages ??
      this.defaults.nMaxImages
    )
  }

  set nMaxImages(value) {
    this.appState.updateSettings({relationshipChartMaxImages: value}, false)
  }

  get nameDisplayFormat() {
    return (
      this.appState?.settings?.relationshipChartNameDisplayFormat ??
      this.defaults.nameDisplayFormat
    )
  }

  set nameDisplayFormat(value) {
    this.appState.updateSettings(
      {relationshipChartNameDisplayFormat: value},
      false
    )
  }

  _resetLevels() {
    this.nAnc = this.defaults.nAnc
    this.nMaxImages = this.defaults.nMaxImages
    this.nameDisplayFormat = this.defaults.nameDisplayFormat
  }

  _getPersonRules(grampsId) {
    return {
      function: 'or',
      rules: [
        {
          name: 'DegreesOfSeparation',
          values: [grampsId, this.nAnc],
        },
      ],
    }
  }

  get personProfile() {
    return 'self,events,families'
  }

  renderPreferencesExtra() {
    return html`
      <section
        class="relationship-legend"
        aria-labelledby="relationship-legend-title"
      >
        <h3 id="relationship-legend-title">
          ${this._('Relationship chart legend')}
        </h3>
        <div class="legend-grid">
          ${[
            [unionVisualCodes.married],
            [unionVisualCodes.divorced],
            [unionVisualCodes.married, 'right', 'Widowed'],
            [unionVisualCodes.partners],
            [unionVisualCodes.unknown],
          ].map(
            ([visual, deceasedSide, label = visual.label]) =>
              html`<div class="legend-item">
                ${renderUnionSample(visual, deceasedSide)}
                <span>${this._(label)}</span>
              </div>`
          )}
          <div class="legend-item">
            <svg class="legend-sample" viewBox="0 0 70 22" aria-hidden="true">
              <path
                class="descent-sample"
                d="M 1 4 H 23 C 29 4 35 10 35 16 V 19"
              ></path>
            </svg>
            <span>${this._('Parent-child connection')}</span>
          </div>
        </div>
        <p class="legend-note">
          ${this._(
            "Each partner's union line uses that person's gender color."
          )}
        </p>
      </section>
    `
  }

  renderChart() {
    return html`
      <div @add-new-person-relation="${this._handleAddPersonRelation}">
        <grampsjs-relationship-chart
          grampsId=${this.grampsId}
          nAnc=${this.nAnc + 1}
          nMaxImages=${this.nMaxImages}
          nameDisplayFormat=${this.nameDisplayFormat}
          ?canEdit="${this._editMode}"
          .data=${this._data}
        >
        </grampsjs-relationship-chart>
      </div>
    `
  }

  renderContent() {
    return html`
      ${super.renderContent()}
      <grampsjs-tree-chart-add-person
        .appState="${this.appState}"
      ></grampsjs-tree-chart-add-person>
    `
  }
}

window.customElements.define(
  'grampsjs-view-relationship-chart',
  GrampsjsViewRelationshipChart
)
