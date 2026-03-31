import test from 'node:test';
import assert from 'node:assert/strict';

import { registerEncounter } from '../src/modules/encounter/services/registerEncounter.js';
import { registerPatient } from '../src/modules/patient/services/registerPatient.js';

const fhirConfig = {
  baseUrl: 'http://fhir:8080/fhir',
  timeoutMs: 1000,
};

function emptyPatientBundle() {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: 0,
    entry: [],
  };
}

test(
  'registerPatient reuses an explicit patient reference and appends the new hospital MRN',
  async () => {
    const existingPatient = {
      resourceType: 'Patient',
      id: '1051',
      identifier: [
        {
          system: 'https://registry.example.org/id/source/bir/mrn',
          value: 'ERN-0131',
          type: { text: 'Hospital MRN' },
        },
      ],
      managingOrganization: {
        reference: 'Organization/1101',
      },
      name: [
        {
          use: 'official',
          family: 'Sharma',
          given: ['Sita'],
          text: 'Sita Sharma',
        },
      ],
      telecom: [
        {
          system: 'phone',
          value: '9800000000',
          use: 'mobile',
        },
      ],
      gender: 'female',
      birthDate: '1994-02-10',
    };

    let createCalled = false;
    let updatedPatient = null;

    const out = await registerPatient(
      { fhirConfig },
      {
        local_patient_id: 'KANTI-0001',
        first_name: 'Sita',
        last_name: 'Sharma',
        dob: '1994-02-10',
        sex: 'F',
        phone: '9800000000',
      },
      {
        organizationId: '1001',
        patientIdentifierSystem:
          'https://registry.example.org/id/source/kanti/mrn',
        existingPatientReference: 'Patient/1051',
      },
      {
        readPatientById: async () => ({ status: 200, data: existingPatient }),
        searchPatientByIdentifier: async () => ({
          status: 200,
          data: emptyPatientBundle(),
        }),
        createPatientConditionally: async () => {
          createCalled = true;
          return { status: 201, data: { id: '1102' } };
        },
        updatePatient: async (_config, patient) => {
          updatedPatient = patient;
          return { status: 200, data: patient };
        },
      },
    );

    assert.equal(createCalled, false);
    assert.equal(out.action, 'updated');
    assert.equal(out.resource.id, '1051');
    assert.equal(out.resource.managingOrganization.reference, 'Organization/1001');
    assert.ok(
      updatedPatient.identifier.some(
        (identifier) =>
          identifier.system ===
            'https://registry.example.org/id/source/kanti/mrn' &&
          identifier.value === 'KANTI-0001',
      ),
    );
  },
);

test(
  'registerPatient rejects a conflicting explicit patient reference and MRN owner',
  async () => {
    await assert.rejects(
      () =>
        registerPatient(
          { fhirConfig },
          {
            local_patient_id: 'KANTI-0001',
            first_name: 'Sita',
            last_name: 'Sharma',
            dob: '1994-02-10',
            sex: 'F',
            phone: '9800000000',
          },
          {
            organizationId: '1001',
            patientIdentifierSystem:
              'https://registry.example.org/id/source/kanti/mrn',
            existingPatientReference: 'Patient/1051',
          },
          {
            readPatientById: async () => ({
              status: 200,
              data: { resourceType: 'Patient', id: '1051', identifier: [] },
            }),
            searchPatientByIdentifier: async () => ({
              status: 200,
              data: {
                resourceType: 'Bundle',
                type: 'searchset',
                total: 1,
                entry: [
                  {
                    resource: {
                      resourceType: 'Patient',
                      id: '1102',
                      identifier: [],
                    },
                  },
                ],
              },
            }),
          },
        ),
      (error) => {
        assert.equal(error?.status, 409);
        assert.match(error?.message || '', /conflicts with existing patient/i);
        return true;
      },
    );
  },
);

test('registerEncounter rejects a mismatched subject reference', async () => {
  let createCalled = false;

  await assert.rejects(
    () =>
      registerEncounter(
        { fhirConfig },
        {
          encounter_id: 'ENC-0131',
          subject: { reference: 'Patient/1051' },
        },
        {
          patientId: '1102',
          organizationId: '1001',
        },
        {
          createEncounter: async () => {
            createCalled = true;
            return { status: 201, data: {} };
          },
        },
      ),
    (error) => {
      assert.equal(error?.status, 409);
      assert.match(error?.message || '', /does not match resolved patient/i);
      return true;
    },
  );

  assert.equal(createCalled, false);
});

test('registerEncounter pins the subject to the resolved patient', async () => {
  let createdEncounter = null;

  const out = await registerEncounter(
    { fhirConfig },
    {
      encounter_id: 'ENC-0131',
      subject: { reference: 'Patient/1051' },
      encounter_class: 'outpatient',
      encounter_start: '2026-03-29T10:00:00+05:45',
      reason_text: 'Initial registration visit',
    },
    {
      patientId: '1051',
      organizationId: '1001',
    },
    {
      createEncounter: async (_config, encounter) => {
        createdEncounter = encounter;
        return { status: 201, data: encounter };
      },
    },
  );

  assert.equal(out.action, 'created');
  assert.equal(createdEncounter.subject.reference, 'Patient/1051');
  assert.equal(createdEncounter.serviceProvider.reference, 'Organization/1001');
});
