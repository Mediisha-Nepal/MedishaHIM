import {
  mapGender,
  nonEmptyString,
  buildTelecom,
  buildAddress,
  convertAdditionalIdentifier,
} from './common.js';

export function toFhirPatient(input) {
  if (!input?.local_patient_id) throw new Error('local_patient_id is required');

  const first = nonEmptyString(input.first_name);
  let additionalIdentifier;
  const last = nonEmptyString(input.last_name);
  const full = [first, last].filter(Boolean).join(' ').trim() || undefined;
  if (input.additional_identifier) {
    additionalIdentifier = convertAdditionalIdentifier(
      input.additional_identifier,
    );
  }

  const patient = {
    resourceType: 'Patient',
    active: true,
    identifier: [
      {
        system: input.identifier_system,
        value: String(input.local_patient_id),
        type: { text: 'Hospital MRN' },
      },
      ...(additionalIdentifier || []),
    ],
    name: [
      {
        use: 'official',
        family: last,
        given: first ? [first] : undefined,
        text: full,
      },
    ],
    gender: mapGender(input.sex),
    birthDate: input.dob || undefined,
  };

  const organizationReference =
    input.managingOrganization?.reference ||
    input.organization?.reference ||
    input.organization_id ||
    input.managing_organization_id;

  if (organizationReference) {
    const reference = String(organizationReference);
    patient.managingOrganization = {
      reference: reference.includes('/')
        ? reference
        : `Organization/${reference}`,
    };
  }

  const telecom = buildTelecom({ phone: input.phone, email: input.email });
  if (telecom) patient.telecom = telecom;

  const addr = buildAddress(input.address);
  if (addr) patient.address = addr;

  return patient;
}
