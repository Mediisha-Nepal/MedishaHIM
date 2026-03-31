import { CONTENT_TYPES } from '../../config/constants.js';
import {
  convertIdentifier,
  urlAdditionalIdentifier,
} from '../../mappers/fhir/common.js';
import { searchPatientFlow } from '../../orchestrators/patient/searchPatientFlow.js';
import { validateDemographicsSearch } from '../../validators/patientInput.js';

function nonEmptyString(value) {
  const str = (value ?? '').toString().trim();
  return str.length ? str : undefined;
}

export function patientSearchRoute({ serviceConfig }) {
  return async (req, res) => {
    const identifier = nonEmptyString(req.query.identifier);
    const value = nonEmptyString(req.query.value);
    const type = nonEmptyString(req.query.type);

    const rawDemographics = {
      given: nonEmptyString(
        req.query.given ?? req.query.firstName ?? req.query.first_name,
      ),
      family: nonEmptyString(
        req.query.family ?? req.query.lastName ?? req.query.last_name,
      ),
      birthDate: nonEmptyString(
        req.query.birthDate ?? req.query.birthdate ?? req.query.dob,
      ),
      gender: nonEmptyString(req.query.gender ?? req.query.sex),
      phone: nonEmptyString(req.query.phone),
    };

    const hasIdentifierInput = Boolean(identifier || value || type);
    let out;

    if (hasIdentifierInput) {
      if (!identifier) {
        const err = new Error('Identifier query parameter is required.');
        err.status = 400;
        throw err;
      }
      if (!value) {
        const err = new Error('Value query parameter is required.');
        err.status = 400;
        throw err;
      }

      const sourceIdentifier =
        type === 'MRN'
          ? convertIdentifier(identifier)
          : urlAdditionalIdentifier(identifier);

      out = await searchPatientFlow(
        { serviceConfig },
        { sourceIdentifier, value },
      );
    } else {
      const demographicsValidation =
        validateDemographicsSearch(rawDemographics);
      if (!demographicsValidation.ok) {
        const err = new Error(demographicsValidation.message);
        err.status = 400;
        throw err;
      }

      out = await searchPatientFlow(
        { serviceConfig },
        { demographics: demographicsValidation.demographics },
      );
    }

    res
      .status(out.status)
      .set('Content-Type', CONTENT_TYPES.FHIR_JSON)
      .json(out.data);
  };
}
