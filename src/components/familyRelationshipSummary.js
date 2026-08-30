import {html} from 'lit'

export function getFamilyRelationshipSummary(profile = {}) {
  const marriage = profile.marriage || {}
  const divorce = profile.divorce || {}
  const hasMarriage = Boolean(marriage.date || marriage.place)
  const hasDivorce = Object.keys(divorce).length > 0

  return {
    relationship: profile.relationship || '',
    marriage: hasMarriage
      ? {
          date: marriage.date || '',
          place: marriage.place_name || marriage.place || '',
        }
      : null,
    divorce: hasDivorce
      ? {
          date: divorce.date || '',
          place: divorce.place_name || divorce.place || '',
        }
      : null,
  }
}

export function hasFamilyRelationshipSummary(profile = {}) {
  const summary = getFamilyRelationshipSummary(profile)
  return Boolean(summary.relationship || summary.marriage || summary.divorce)
}

export function renderFamilyRelationshipSummary(profile, translate) {
  const summary = getFamilyRelationshipSummary(profile)
  return html`
    ${summary.relationship}
    ${summary.marriage
      ? html`<span class="parent-dates">
          <span class="sym">⚭</span>
          ${summary.marriage.date}
          ${summary.marriage.place
            ? `${translate('in')} ${summary.marriage.place}`
            : ''}
        </span>`
      : ''}
    ${summary.divorce
      ? html`<span class="parent-dates">
          <span class="sym">⚮</span>
          ${summary.divorce.date}
          ${summary.divorce.place
            ? `${translate('in')} ${summary.divorce.place}`
            : ''}
        </span>`
      : ''}
  `
}
