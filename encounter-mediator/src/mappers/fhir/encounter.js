const ENCOUNTER_CLASS_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/v3-ActCode';

const CLASS_CODE_MAP = {
  ambulatory: 'AMB',
  outpatient: 'AMB',
  inpatient: 'IMP',
  emergency: 'EMER',
  home: 'HH',
  virtual: 'VR',
};

const nonEmptyString = (value) => {
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str.length ? str : undefined;
};

const compact = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object') return Object.keys(value).length > 0;
      return true;
    }),
  );

function toReference(resourceType, value) {
  if (!value) return undefined;
  if (typeof value === 'object' && value.reference) return value;
  const raw = nonEmptyString(value);
  if (!raw) return undefined;
  return {
    reference: raw.includes('/') ? raw : `${resourceType}/${raw}`,
  };
}

function buildIdentifier(input) {
  if (Array.isArray(input.identifier) && input.identifier.length > 0) {
    return input.identifier;
  }

  const value = nonEmptyString(
    input.encounter_id || input.local_encounter_id || input.id,
  );
  if (!value) return undefined;

  return [
    compact({
      system:
        nonEmptyString(input.identifier_system) ||
        'https://registry.example.org/id/encounter/local',
      value,
    }),
  ];
}

function buildClass(input) {
  if (!input) {
    return {
      system: ENCOUNTER_CLASS_SYSTEM,
      code: 'AMB',
      display: 'ambulatory',
    };
  }

  if (typeof input === 'object' && !Array.isArray(input)) {
    if (Array.isArray(input.coding) && input.coding.length > 0) {
      const coding = input.coding[0] || {};
      return compact({
        system: coding.system || ENCOUNTER_CLASS_SYSTEM,
        code: coding.code || 'AMB',
        display: coding.display,
      });
    }

    return compact({
      system: input.system || ENCOUNTER_CLASS_SYSTEM,
      code: input.code || 'AMB',
      display: input.display,
    });
  }

  const raw = nonEmptyString(input);
  const mapped =
    CLASS_CODE_MAP[(raw || '').toLowerCase()] || raw?.toUpperCase();
  return compact({
    system: ENCOUNTER_CLASS_SYSTEM,
    code: mapped || 'AMB',
    display: raw,
  });
}

function buildType(input) {
  if (!input) return undefined;
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return [{ text: input }];

  if (typeof input === 'object') {
    if (Array.isArray(input.coding) || input.text) return [input];
    if (input.code || input.display) {
      return [
        {
          coding: [
            compact({
              system: input.system,
              code: input.code,
              display: input.display,
            }),
          ],
          text: input.text,
        },
      ];
    }
  }

  return undefined;
}

function buildPeriod(input) {
  if (input?.period && typeof input.period === 'object') {
    return compact({
      start: nonEmptyString(input.period.start),
      end: nonEmptyString(input.period.end),
    });
  }

  return compact({
    start: nonEmptyString(input.encounter_start || input.start),
    end: nonEmptyString(input.encounter_end || input.end),
  });
}

function buildReasonCode(input) {
  const reason = input.reason || input.reason_text || input.chief_complaint;
  const text = nonEmptyString(reason);
  return text ? [{ text }] : undefined;
}

function buildLocation(input) {
  if (Array.isArray(input.location) && input.location.length > 0) {
    return input.location;
  }

  const locationRef = toReference(
    'Location',
    input.location_id || input.locationId,
  );
  return locationRef ? [{ location: locationRef }] : undefined;
}

function buildParticipant(input) {
  if (Array.isArray(input.participant) && input.participant.length > 0) {
    return input.participant;
  }

  const practitionerRef = toReference(
    'Practitioner',
    input.practitioner_id || input.practitionerId,
  );
  if (!practitionerRef) return undefined;

  return [{ individual: practitionerRef }];
}

export function toFhirEncounter(input) {
  if (input.resourceType === 'Encounter') {
    return compact({
      ...input,
      status: input.status || 'finished',
      class: input.class || buildClass(undefined),
    });
  }

  const encounter = compact({
    resourceType: 'Encounter',
    status:
      nonEmptyString(input.status || input.encounter_status) || 'finished',
    class: buildClass(input.class || input.encounter_class || input.class_code),
    identifier: buildIdentifier(input),
    subject: toReference(
      'Patient',
      input.subject?.reference ||
        input.subject ||
        input.patient_id ||
        input.patientId,
    ),
    serviceProvider: toReference(
      'Organization',
      input.serviceProvider?.reference ||
        input.serviceProvider ||
        input.organization_id ||
        input.organizationId,
    ),
    type: buildType(input.type || input.encounter_type),
    period: buildPeriod(input),
    reasonCode: buildReasonCode(input),
    location: buildLocation(input),
    participant: buildParticipant(input),
  });

  return encounter;
}
