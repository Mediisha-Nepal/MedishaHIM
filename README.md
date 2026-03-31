# OpenHIE (OpenHIM-first) Sandbox Template

This repo is a developer-friendly starter for learning OpenHIE-style interoperability by building:

- **OpenHIM Core + Console + MongoDB** (interoperability layer "spine")
- a **FHIR server** (HAPI) as a downstream system
- a **simple mediator** (Node/Express) that registers to OpenHIM and forwards requests to the FHIR server
- a **registration mediator** that orchestrates Organization lookup + Patient upsert + Encounter creation in one API call

## 0) Prereqs

- Docker + Docker Compose v2+
- A terminal (bash/powershell)

## 1) Start everything

```bash
docker compose up -d --build
```

OpenHIM Console: http://localhost:9000

Default login (first run):

- username: root@openhim.org
- password: openhim-password

> You may be asked to accept the self-signed TLS certificate used by OpenHIM Core.
> Open https://localhost:8080/heartbeat in your browser and accept the certificate.

## 2) Add the mediator's default channel

The mediator registers itself with OpenHIM. To activate its channel:

1. In Console, go to **Mediators**
2. Click **FHIR Forwarder Mediator**
3. Click the green **+** button next to the default channel config to add it

This creates a channel that matches URLs starting with `/fhir/` and routes to the mediator.

## 3) Create a client for testing (Basic Auth)

1. Go to **Clients** → **+ Client**
2. Create:
   - Client ID: `DEMO`
   - Name: `Demo Client`
   - Add role: `DEMO`
   - Authentication: **Basic**
   - Password: `demopassword`
3. Edit the created channel and allow role/client `DEMO` (or keep `admin` during early testing).

## 4) Test an end-to-end request

This creates a Patient in the HAPI FHIR server (via OpenHIM → mediator → HAPI FHIR):

```bash
curl -X POST "http://localhost:5001/fhir/Patient"   -H "Authorization: Basic $(echo -n DEMO:demopassword | base64)"   -H "Content-Type: application/fhir+json"   -d '{
    "resourceType":"Patient",
    "name":[{"use":"official","family":"Test","given":["OpenHIE"]}],
    "gender":"unknown"
  }'
```

Check:

- OpenHIM Console → **Transactions**
- HAPI UI: http://localhost:8081/ (FHIR base URL is http://localhost:8081/fhir/)

## 5) Where to change things

- OpenHIM config: `docker-compose.yml` (ports, auth types, etc.)
- Mediator code: `patient-mediator/`, `organization-mediator/`, `encounter-mediator/`
- Unified registration flow: `registration-mediator/`
- Target downstream: set `TARGET_FHIR_BASE` in docker-compose

## Notes

- If you change the OpenHIM `root@openhim.org` password on first login, update the mediator env vars accordingly.

## Unified Patient Registration (Single API)

Call one endpoint and let the mediator orchestrate:
1. Search organization directly in FHIR by identifier
2. Create/update patient directly in FHIR (linked to that organization)
3. Create encounter directly in FHIR for that patient

Endpoint:

```bash
POST http://localhost:3003/registration/patient
```

Response:

- FHIR `Bundle` (`type: collection`) with `Patient` and `Encounter` resources in `entry[]`.
- Status `201` when new patient/encounter is created, otherwise `200`.

Example body:

```json
{
  "patient": {
    "local_patient_id": "P-1001",
    "first_name": "Sita",
    "last_name": "Sharma",
    "dob": "1994-02-10",
    "sex": "F",
    "phone": "9800000000"
  },
  "encounter": {
    "encounter_id": "E-1001",
    "encounter_class": "outpatient",
    "reason_text": "Initial registration visit",
    "encounter_start": "2026-03-29T10:00:00+05:45"
  }
}
```

Existing patient reuse:

- If the request already knows the enterprise patient, send `encounter.subject.reference`, `encounter.patient_id`, or `patient.patient_id`.
- The registration mediator will reuse that `Patient` instead of creating a duplicate record, then attach the current hospital MRN to the same patient before creating the encounter.

Auth-driven source system:

- Request must carry authenticated client id (`x-openhim-clientid`, `x-client-id`, or Basic auth client username).
- Registration mediator uses auth client id as `source_system`.
- If body `source_system` is also provided and does not match authenticated client id, request is rejected.
- Organization lookup system comes from env (`REGISTRATION_ORG_LOOKUP_IDENTIFIER_SYSTEM`) and value always comes from auth client id.
- Patient MRN identifier system is required from organization metadata (`identifier.type.text = "Hospital MRN"`). If missing, registration request is rejected.

Example organization identifiers in FHIR Organization:

```json
[
  {
    "system": "https://nepal-health.example.org/organization-id",
    "value": "TUTH-001"
  },
  {
    "type": { "text": "Hospital MRN" },
    "system": "https://registry.example.org/id/source/kanti/mrn",
    "value": "KANTI-MRN"
  }
]
```
