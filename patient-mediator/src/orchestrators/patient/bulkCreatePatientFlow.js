import {
  validateBulkRequests,
  validateExternalPatient,
} from '../../validators/patientInput.js';
import { toFhirPatient } from '../../mappers/fhir/patient.js';
import { submitBatch } from '../../clients/clientRegistryApi.js';
import { logger } from '../../utils/logger.js';
import {
  appendMissingIdentifiers,
  buildIdentifierSystem,
  buildNhidConflictError,
  hasDifferentIdentifierFromSameSystem,
} from '../../utils/patientIdentifiers.js';
import {
  bestPatientFromBatchEntry,
  buildAdditionalIdSearchBundle,
  buildDemographicsSearchBundle,
  buildSearchByIdentifierBundle,
  buildWriteBundle,
  firstPatientFromBatchEntry,
} from '../../utils/fhirBatch.js';
import {
  applyWriteResultsToItems,
  assembleBulkResponse,
  mapWriteResults,
  markIntraBatchAdditionalIdentifierConflicts,
  markFailedForItems,
  syncBulkNhidIdentifiers,
  validateAndMapBulkPatients,
} from '../../utils/bulkPatientFlow.js';

const CONFLICT_MARKER = '__conflict__';

export async function bulkCreatePatientFlow(
  { serviceConfig },
  { sourceSystem, patients },
) {
  const bulkV = validateBulkRequests({ source_system: sourceSystem, patients });
  if (!bulkV.ok) {
    const err = new Error(bulkV.message);
    err.status = 400;
    throw err;
  }

  const identifierSystem = buildIdentifierSystem(sourceSystem);
  const svcOpts = {
    baseURL: serviceConfig.patientServiceBase,
    timeoutMs: serviceConfig.timeoutMs,
  };

  const { results, validItems } = validateAndMapBulkPatients(
    patients,
    identifierSystem,
    { validateExternalPatient, toFhirPatient },
  );

  if (validItems.length === 0) {
    return assembleBulkResponse(sourceSystem, patients.length, results);
  }

  const matchedPatients = new Array(validItems.length).fill(null);

  const intraBatchConflicts = markIntraBatchAdditionalIdentifierConflicts(
    results,
    validItems,
  );
  for (const vi of intraBatchConflicts) {
    matchedPatients[vi] = CONFLICT_MARKER;
  }

  try {
    const primarySearchResp = await submitBatch(
      svcOpts,
      buildSearchByIdentifierBundle(validItems),
    );
    const primaryEntries = primarySearchResp.data?.entry || [];

    for (let vi = 0; vi < validItems.length; vi++) {
      const found = firstPatientFromBatchEntry(primaryEntries[vi]);
      if (found) matchedPatients[vi] = found;
    }
  } catch (e) {
    logger.error(`Batch primary identifier search failed: ${e.message}`);
    markFailedForItems(
      results,
      validItems,
      `Batch primary identifier search failed: ${e.message}`,
    );
    return assembleBulkResponse(sourceSystem, patients.length, results);
  }

  const unmatchedAfterPrimary = validItems
    .map((_, vi) => vi)
    .filter((vi) => !matchedPatients[vi]);

  if (unmatchedAfterPrimary.length > 0) {
    const unmatchedItems = unmatchedAfterPrimary.map((vi) => validItems[vi]);
    const addIdSearch = buildAdditionalIdSearchBundle(unmatchedItems);

    if (addIdSearch) {
      try {
        const addIdResp = await submitBatch(svcOpts, addIdSearch.bundle);
        const addIdEntries = addIdResp.data?.entry || [];

        for (let fi = 0; fi < unmatchedItems.length; fi++) {
          const vi = unmatchedAfterPrimary[fi];
          const item = validItems[vi];
          const entryIndices = addIdSearch.map[fi] || [];

          for (const ei of entryIndices) {
            const found = firstPatientFromBatchEntry(addIdEntries[ei]);
            if (!found) continue;

            if (
              hasDifferentIdentifierFromSameSystem(
                found,
                item.identifier.system,
                item.identifier.value,
              )
            ) {
              results[item.index] = {
                local_patient_id: item.raw.local_patient_id,
                action: 'failed',
                error: buildNhidConflictError(
                  item.identifier.system,
                  item.identifier.value,
                  found.id,
                ).message,
              };
              matchedPatients[vi] = CONFLICT_MARKER;
            } else {
              matchedPatients[vi] = found;
            }
            break;
          }
        }
      } catch (e) {
        logger.warn(
          `Batch additional identifier search failed: ${e.message} - skipping`,
        );
      }
    }
  }

  const unmatchedAfterAdditional = validItems
    .map((_, vi) => vi)
    .filter((vi) => !matchedPatients[vi]);

  if (unmatchedAfterAdditional.length > 0) {
    const unmatchedItems = unmatchedAfterAdditional.map((vi) => validItems[vi]);

    try {
      const demoSearchResp = await submitBatch(
        svcOpts,
        buildDemographicsSearchBundle(unmatchedItems),
      );
      const demoEntries = demoSearchResp.data?.entry || [];

      for (let fi = 0; fi < unmatchedItems.length; fi++) {
        const vi = unmatchedAfterAdditional[fi];
        const item = validItems[vi];
        const found = bestPatientFromBatchEntry(
          demoEntries[fi],
          item.identifier.system,
          item.identifier.value,
        );
        if (found) matchedPatients[vi] = found;
      }
    } catch (e) {
      logger.warn(`Batch demographics search failed: ${e.message} - skipping`);
    }
  }

  const writeOps = [];
  const writeOpsSourceIndex = [];
  const mergedInto = new Array(validItems.length).fill(-1);
  const claimedPatients = new Map();

  for (let vi = 0; vi < validItems.length; vi++) {
    const item = validItems[vi];
    const existingPatient = matchedPatients[vi];

    if (existingPatient === CONFLICT_MARKER) continue;

    if (existingPatient) {
      if (
        hasDifferentIdentifierFromSameSystem(
          existingPatient,
          item.identifier.system,
          item.identifier.value,
        )
      ) {
        results[item.index] = {
          local_patient_id: item.raw.local_patient_id,
          action: 'failed',
          error: buildNhidConflictError(
            item.identifier.system,
            item.identifier.value,
            existingPatient.id,
          ).message,
        };
        continue;
      }

      const existingId = existingPatient.id;
      if (claimedPatients.has(existingId)) {
        const ownerIdx = claimedPatients.get(existingId);
        const ownerOp = writeOps[ownerIdx];

        if (
          hasDifferentIdentifierFromSameSystem(
            ownerOp.updatedPatient,
            item.identifier.system,
            item.identifier.value,
          )
        ) {
          results[item.index] = {
            local_patient_id: item.raw.local_patient_id,
            action: 'failed',
            error: buildNhidConflictError(
              item.identifier.system,
              item.identifier.value,
              existingId,
            ).message,
          };
          continue;
        }

        ownerOp.updatedPatient = appendMissingIdentifiers(
          ownerOp.updatedPatient,
          item.fhirPatient.identifier || [],
        ).updated;
        mergedInto[vi] = ownerIdx;
      } else {
        const merged = appendMissingIdentifiers(
          existingPatient,
          item.fhirPatient.identifier || [],
        );

        const opIdx = writeOps.length;
        writeOps.push({
          action: 'update',
          existingPatientId: existingId,
          updatedPatient: merged.updated,
          identifier: item.identifier,
          fhirPatient: item.fhirPatient,
          sourceSystem: item.identifier.system,
          sourceValue: item.identifier.value,
        });
        writeOpsSourceIndex.push(vi);
        claimedPatients.set(existingId, opIdx);
      }
    } else {
      const opIdx = writeOps.length;
      writeOps.push({
        action: 'create',
        fhirPatient: item.fhirPatient,
        identifier: item.identifier,
        sourceSystem: item.identifier.system,
        sourceValue: item.identifier.value,
      });
      writeOpsSourceIndex.push(vi);
    }
  }

  if (writeOps.length === 0) {
    return assembleBulkResponse(sourceSystem, patients.length, results);
  }

  let writeResp;
  try {
    writeResp = await submitBatch(svcOpts, buildWriteBundle(writeOps));
  } catch (e) {
    logger.error(`Batch write failed: ${e.message}`);
    for (const item of validItems) {
      if (!results[item.index]) {
        results[item.index] = {
          local_patient_id: item.raw.local_patient_id,
          action: 'failed',
          error: `Batch write failed: ${e.message}`,
        };
      }
    }
    return assembleBulkResponse(sourceSystem, patients.length, results);
  }

  const writeEntries = writeResp.data?.entry || [];
  const writeResults = mapWriteResults(writeOps, writeEntries);

  applyWriteResultsToItems(
    validItems,
    results,
    writeResults,
    mergedInto,
    writeOpsSourceIndex,
  );

  await syncBulkNhidIdentifiers({
    serviceConfig,
    writeOps,
    writeResults,
    validItems,
    results,
    mergedInto,
    writeOpsSourceIndex,
  });

  return assembleBulkResponse(sourceSystem, patients.length, results);
}
