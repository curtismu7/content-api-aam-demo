# Content API AAM Demo

Demo of PingOne Authorize's API Access Management (AAM) side-band feature:
a demo page fires a request, PingGateway calls PingOne Authorize (side-band)
for a permit/deny decision, and on PERMIT proxies to a sample Content API
serving a small movie/show catalog.

See [docs/superpowers/specs/2026-07-27-content-api-aam-demo-design.md](docs/superpowers/specs/2026-07-27-content-api-aam-demo-design.md)
for the full design.

## Architecture

demo-page --> ping-gateway /aam/* --> PingOne Authorize AAM sideband --> PERMIT --> content-api

## PingOne console prerequisites (you set these up)

Before this demo can PERMIT anything, configure in your PingOne Authorize tenant
(Authorization > API Gateways):

1. Create a Group.
2. Create an API Gateway + Credential under that group. Note its Service URL
   and Credential value.
3. Create an API Service pointed at the `ContentAPIDecisionPoint` decision
   point (see `snapshots/content-api-decision-point.json`), with operations
   covering: `GET /aam/health`, `GET /aam/content`, `GET /aam/content/{id}`.
4. Confirm the decision point's policy (authored from `policy/restrictions.yaml`
   and `policy/amountAsCode.yaml`) evaluates `Request.Amount`, `Request.Age`,
   and `Request.Location` by reading them from request headers -- this demo
   sends `X-Demo-Amount`, `X-Demo-Age`, `X-Demo-Location` on every request.

## Environment variables

| Variable | Where it's used | Value |
|---|---|---|
| `PG_AAM_SERVICE_URL` | ping-gateway | Authorization > API Gateways > <gateway> > Service URL |
| `AAM_GATEWAY_SECRET` | ping-gateway | Authorization > API Gateways > <gateway> > Credentials (paste verbatim, not base64) |
| `IMAGE_REGISTRY` | deploy.sh | optional; prefix for pushed image tags, e.g. `ghcr.io/yourorg/` (leave unset for a local cluster) |
| `IMAGE_TAG` | deploy.sh | optional; defaults to `latest` |

Copy these into a local `.env` file (gitignored) or export them before running
`scripts/deploy.sh`.

## Local development loop (no k8s)

```bash
npm install
npm test
node content-api/server.js   # serves the catalog on :8080
```

## Deploy to k8s

```bash
export PG_AAM_SERVICE_URL=...
export AAM_GATEWAY_SECRET=...
./scripts/deploy.sh
kubectl get pods -n content-api-aam-demo
```

Requires `kubectl` pointed at your target cluster, `docker`, and `envsubst`
(part of `gettext` -- `brew install gettext` on macOS if missing).

## Try it

Port-forward or use the `demo-page` service's NodePort (30080), fill in a
scenario, and send a request. Examples using the seeded catalog
(`content-api/sample-data.json`):

- **PERMIT (amount)**: item `glass-frontier` (price 99), age/location that
  satisfies `restrictions.yaml`.
- **DENY (amount)**: item `echo-chamber` (price 101).
- **DENY (age/region)**: `X-Demo-Age: 15`, `X-Demo-Location: EMEA`.
