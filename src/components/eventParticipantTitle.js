function personTitle(person) {
  return person
    ? `${person.name_given || '…'} ${person.name_surname || '…'}`
    : ''
}

export function eventParticipantTitle(profile, translate) {
  const primary = translate('Primary')
  const family = translate('Family')
  const people = profile.participants.people
    .filter(item => item.role === primary || item.role === 'Primary')
    .map(item => personTitle(item.person))
  const families = profile.participants.families
    .filter(item => item.role === family || item.role === 'Family')
    .map(
      item =>
        `${personTitle(item.family.father)} & ${personTitle(
          item.family.mother
        )}`
    )
  const participants = [...people, ...families].filter(Boolean).join(', ')
  return participants ? `${profile.type}: ${participants}` : profile.type
}
