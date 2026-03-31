import { generateNhid } from '../clients/nhidServiceApi.js';
import { updatePatient } from '../clients/clientRegistryApi.js';
import { logger } from './logger.js';
import { extractPatientIdFromLocation } from './fhirBatch.js';
import {
  buildNhidRequestPayload,
  findAnyNhidIdentifier,
  getNhidFromResponse,
  hasNhidIdentifier,
  isPossibleMatchResponse,
} from './nhid.js';

export function assembleBulkResponse(sourceSystem, total, results) {
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const r of results) {
    if (!r || r.action === 'failed') {
      failed++;
    } else if (r.action === 'created') {
      created++;
    } else {
      updated++;
    }
  }

  return {
    status: 207,
    data: {
      source_system: sourceSystem,
      total,
      created,
      updated,
      failed,
      results: results.map(
        (r) =>
          r || {
            local_patient_id: null,
            action: 'failed',
            error: 'Unknown processing error',
          },
      ),
    },
  };
}

export function validateAndMapBulkPatients(
  patients,
  identifierSystem,
  { validateExternalPatient, toFhirPatient },
) {
  const results = new Array(patients.length);
  const validItems = [];

  for (let i = 0; i < patients.length; i++) {
    const raw = { ...patients[i], identifier_system: identifierSystem };
    const v = validateExternalPatient(raw);
    if (!v.ok) {
      results[i] = {
        local_patient_id: raw.local_patient_id || null,
        action: 'failed',
        error: v.message,
      };
      continue;
    }

    let fhirPatient;
    try {
      fhirPatient = toFhirPatient(raw);
    } catch (e) {
      results[i] = {
        local_patient_id: raw.local_patient_id || null,
        action: 'failed',
        error: e.message,
      };
      continue;
    }

    const identifier = fhirPatient.identifier?.[0];
    if (!identifier?.system || !identifier?.value) {
      results[i] = {
        local_patient_id: raw.local_patient_id || null,
        action: 'failed',
        error:
          'Mapped FHIR Patient is missing identifier.system or identifier.value',
      };
      continue;
    }

    validItems.push({ index: i, raw, fhirPatient, identifier });
  }

  return { results, validItems };
}

export function markFailedForItems(results, validItems, errorMessage) {
  for (const item of validItems) {
    results[item.index] = {
      local_patient_id: item.raw.local_patient_id,
      action: 'failed',
      error: errorMessage,
    };
  }
}

export function markIntraBatchAdditionalIdentifierConflicts(
  results,
  validItems,
) {
  const conflictVis = new Set();
  const seen = new Map();

  for (let vi = 0; vi < validItems.length; vi++) {
    const item = validItems[vi];
    const primarySystem = item.identifier?.system;
    const primaryValue = String(item.identifier?.value || '');
    const additionalIds = (item.fhirPatient.identifier || []).slice(1);

    for (const addId of additionalIds) {
      if (!addId?.system || !addId?.value) continue;

      const key = `${addId.system}|${String(addId.value).trim()}`;
      const prev = seen.get(key);

      if (!prev) {
        seen.set(key, {
          vi,
          primarySystem,
          primaryValue,
          localPatientId: item.raw.local_patient_id,
        });
        continue;
      }

      const samePrimary =
        prev.primarySystem === primarySystem &&
        prev.primaryValue === primaryValue;

      if (samePrimary) continue;

      results[item.index] = {
        local_patient_id: item.raw.local_patient_id,
        action: 'failed',
        error: `Conflict: additional identifier ${key} is duplicated in this bulk request (already used by local_patient_id ${prev.localPatientId}).`,
      };
      conflictVis.add(vi);
      break;
    }
  }

  return conflictVis;
}

export function mapWriteResults(writeOps, writeEntries) {
  const writeResults = [];

  for (let j = 0; j < writeOps.length; j++) {
    const entry = writeEntries[j];
    const status = entry?.response?.status || '';
    writeResults.push({
      ok:
        status.startsWith('200') ||
        status.startsWith('201') ||
        status.startsWith('204'),
      action: writeOps[j].action === 'create' ? 'created' : 'updated',
      patient: entry?.resource || null,
      status,
      location: entry?.response?.location,
    });
  }

  return writeResults;
}

export function resolveWriteIndex(vi, mergedInto, writeOpsSourceIndex) {
  if (mergedInto[vi] !== -1) return mergedInto[vi];
  return writeOpsSourceIndex.findIndex((srcVi) => srcVi === vi);
}

export function applyWriteResultsToItems(
  validItems,
  results,
  writeResults,
  mergedInto,
  writeOpsSourceIndex,
) {
  for (let vi = 0; vi < validItems.length; vi++) {
    const item = validItems[vi];
    if (results[item.index]?.action === 'failed') continue;

    const writeIdx = resolveWriteIndex(vi, mergedInto, writeOpsSourceIndex);
    if (writeIdx === -1 || !writeResults[writeIdx]) {
      results[item.index] = {
        local_patient_id: item.raw.local_patient_id,
        action: 'failed',
        error: 'No write result returned by HAPI',
      };
      continue;
    }

    const wr = writeResults[writeIdx];
    if (!wr.ok) {
      results[item.index] = {
        local_patient_id: item.raw.local_patient_id,
        action: 'failed',
        error: `HAPI returned ${wr.status}`,
      };
      continue;
    }

    results[item.index] = {
      local_patient_id: item.raw.local_patient_id,
      action: mergedInto[vi] !== -1 ? 'updated' : wr.action,
      patient: wr.patient,
    };
  }
}

export async function syncBulkNhidIdentifiers({
  serviceConfig,
  writeOps,
  writeResults,
  validItems,
  results,
  mergedInto,
  writeOpsSourceIndex,
}) {
  if (!serviceConfig.nhidServiceBase || !serviceConfig.nhidIdentifierSystem) {
    return;
  }

  const nhidSvcOpts = {
    baseUrl: serviceConfig.nhidServiceBase,
    timeoutMs: serviceConfig.nhidTimeoutMs || serviceConfig.timeoutMs,
  };
  const nhidSystem = serviceConfig.nhidIdentifierSystem;

  const nhidTasks = [];
  for (let j = 0; j < writeOps.length; j++) {
    if (!writeResults[j].ok) continue;

    const writeOp = writeOps[j];
    const writeResult = writeResults[j];
    const locationId = extractPatientIdFromLocation(writeResult.location);
    const fhirId =
      writeResult.patient?.id || writeOp.existingPatientId || locationId;

    if (!fhirId) {
      writeResults[j].nhidError = 'Could not determine FHIR Patient id';
      continue;
    }

    const baseSnapshot =
      writeResult.patient ||
      (writeOp.action === 'update'
        ? writeOp.updatedPatient
        : writeOp.fhirPatient);

    const patientSnapshot = baseSnapshot
      ? { ...baseSnapshot, id: fhirId }
      : {
          resourceType: 'Patient',
          id: fhirId,
          identifier: [],
        };

    const existingNhid = findAnyNhidIdentifier(
      patientSnapshot,
      nhidSystem,
    )?.value;

    nhidTasks.push({
      writeIdx: j,
      fhirId,
      patientSnapshot,
      sourceSystem: writeOp.sourceSystem,
      sourceValue: writeOp.sourceValue,
      existingNhid,
    });
  }

  const nhidSettled = await Promise.allSettled(
    nhidTasks.map((task) =>
      generateNhid(
        nhidSvcOpts,
        buildNhidRequestPayload(
          task.patientSnapshot,
          task.sourceSystem,
          task.sourceValue,
          task.existingNhid,
        ),
      ),
    ),
  );

  const fhirUpdateTasks = [];
  for (let ti = 0; ti < nhidTasks.length; ti++) {
    const task = nhidTasks[ti];
    const settled = nhidSettled[ti];

    if (settled.status === 'rejected') {
      logger.warn(
        `NHID generation failed for Patient/${task.fhirId}: ${settled.reason?.message}`,
      );
      writeResults[task.writeIdx].nhidError = settled.reason?.message;
      continue;
    }

    const nhidResp = settled.value;
    if (nhidResp.status === 409 || isPossibleMatchResponse(nhidResp.data)) {
      writeResults[task.writeIdx].nhidError =
        'Possible NHID match found. Manual review/confirmation is required.';
      continue;
    }

    const nhid = getNhidFromResponse(nhidResp.data) || task.existingNhid;
    if (!nhid) {
      writeResults[task.writeIdx].nhidError =
        'NHID service response missing nhid value';
      continue;
    }

    if (task.existingNhid && String(task.existingNhid) !== String(nhid)) {
      writeResults[task.writeIdx].nhidError =
        `NHID mismatch for Patient/${task.fhirId}: existing ${task.existingNhid}, service returned ${nhid}`;
      continue;
    }

    if (hasNhidIdentifier(task.patientSnapshot, nhidSystem, nhid)) {
      writeResults[task.writeIdx].patient = task.patientSnapshot;
      continue;
    }

    const patientWithNhid = {
      ...task.patientSnapshot,
      identifier: [
        ...(task.patientSnapshot.identifier || []),
        { system: nhidSystem, value: String(nhid), type: { text: 'NHID' } },
      ],
    };

    fhirUpdateTasks.push({ writeIdx: task.writeIdx, patientWithNhid });
  }

  const fhirUpdateSettled = await Promise.allSettled(
    fhirUpdateTasks.map(({ patientWithNhid }) =>
      updatePatient(
        {
          baseUrl: serviceConfig.patientServiceBase,
          timeoutMs: serviceConfig.timeoutMs,
        },
        patientWithNhid.id,
        patientWithNhid,
      ),
    ),
  );

  for (let ui = 0; ui < fhirUpdateTasks.length; ui++) {
    const { writeIdx, patientWithNhid } = fhirUpdateTasks[ui];
    const result = fhirUpdateSettled[ui];
    if (result.status === 'fulfilled') {
      writeResults[writeIdx].patient = result.value.data || patientWithNhid;
    } else {
      logger.warn(
        `NHID FHIR update failed for Patient/${patientWithNhid.id}: ${result.reason?.message}`,
      );
      writeResults[writeIdx].nhidError =
        `NHID FHIR sync failed: ${result.reason?.message}`;
      writeResults[writeIdx].patient = patientWithNhid;
    }
  }

  for (let vi = 0; vi < validItems.length; vi++) {
    const item = validItems[vi];
    if (!results[item.index] || results[item.index].action === 'failed') {
      continue;
    }

    const writeIdx = resolveWriteIndex(vi, mergedInto, writeOpsSourceIndex);
    if (writeIdx === -1 || !writeResults[writeIdx]) continue;

    const wr = writeResults[writeIdx];
    results[item.index].patient = wr.patient;
    if (wr.nhidError) results[item.index].nhid_error = wr.nhidError;
  }
}
