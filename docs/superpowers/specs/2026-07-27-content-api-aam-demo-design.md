# Content API AAM Demo — Design Spec

Date: 2026-07-27
Status: Approved by user, pending write-up into implementation plan
Repo: new standalone GitHub project (separate from AI-DEMO2)

## Purpose

Demo PingOne Authorize's API Access Management (AAM) side-band feature end to
end: a user-facing page fires a request, PingGateway receives it and calls
out (side-band) to PingOne Authorize for a permit/deny decision, and the
result — plus a simulated backend API response when permitted — is shown
back on the demo page. Goal is to show off P1AZ + AAM working live against a
real tenant, not a mocked decision.

## Non-goals

- No on-prem "PingAuthorize" PDP container. AAM's `PingAuthorizeFilter` in
  PingGateway calls PingOne Authorize's cloud Sideband API directly — there
  is no self-hosted PDP in this flow, and no such Docker image exists
  anywhere in the source AI-DEMO2 repo to copy.
- No mock/simulated AAM decision path. Mocking the decision would defeat the
  point of the demo (showing the real feature). Only the *content* returned
  after a PERMIT is simulated/sample data — not the authorization decision.
- Not part of the AI-DEMO2 repo, its worktree rules, or its CLAUDE.md
  contract. This is a fresh, independent codebase.

## Prerequisites (owned by user, not this build)

PingOne Authorize tenant, AAM console-configured: Group, API Gateway +
Credential, API Service pointed at the `ContentAPIDecisionPoint` decision
point (already exported as `out.txt` / `content-api.zip`, most recent
2026-07-23). User has worker-token creds, the PingOne MCP server, and a
skill for this — console setup is on them, not part of this build.

## Architecture

Three containers, one real external dependency (the user's PingOne
Authorize tenant):

1. **`demo-page`** — static frontend (plain HTML/JS, no build step). Form
   lets the user pick a catalog item and a scenario (age / region / amount),
   fires the request, displays PERMIT/DENY and the returned content or
   denial reason.

2. **`ping-gateway`** — official PingGateway image + one route, ported from
   AI-DEMO2's `ping-gateway/config/routes/04-aam-api-access.json`. Filter
   chain: `PingAuthorizeFilter` (sideband call to
   `PG_AAM_SERVICE_URL` / `AAM_GATEWAY_SECRET`, from k8s Secret) → on
   PERMIT, reverse-proxy to `content-api`.

3. **`content-api`** — Node/Express. Serves a small sample streaming catalog
   (movies/shows) from a static JSON file. No authorization logic of its
   own — it trusts that the gateway already made the decision.

## Data flow

```
demo-page
  --> POST/GET ping-gateway /aam/*
        (headers carry scenario inputs: X-Demo-Amount, X-Demo-Age,
         X-Demo-Location)
  --> PingAuthorizeFilter side-band call to PingOne Authorize
        (method + path + headers + client-IP)
  --> PERMIT --> reverse-proxy --> content-api --> sample catalog item
  --> DENY   --> gateway returns 403 with decision detail
  <-- demo-page renders PERMIT/DENY + payload or denial reason
```

## Open question / risk (not blocking build)

Unconfirmed whether PingOne Authorize AAM actually forwards arbitrary custom
request headers into the decision context as-is, or whether each header
needs to be declared as an attribute in the console API Service config
first. `amountAsCode.yaml` / `restrictions.yaml` already use
`resolve: request amount` / `request age` / `request location` resolvers
elsewhere in this policy family, so the header-carrying approach is
consistent with prior art — but the user should confirm this when doing the
tenant console setup (via PingOne MCP/skill). If headers aren't forwarded,
fallback is encoding scenario inputs into the request path or query string
instead — route/filter config would need a small adjustment, not a redesign.

## Repo layout

```
/demo-page/          static frontend
/ping-gateway/        route config + Dockerfile-or-official-image ref
/content-api/         Express app + sample-data.json
/k8s/                 numbered plain manifests (mirrors AI-DEMO2 style)
/scripts/deploy.sh    kubectl apply wrapper
/policy/              restrictions.yaml, amountAsCode.yaml (PAC source)
/snapshots/           content-api-decision-point.json (from out.txt, most
                       recent export), content-api.zip kept as older backup
README.md             console prereqs, env vars, run instructions
```

## Seed files (carried over from AI-DEMO2 scratch files)

- `restrictions.yaml` → `policy/restrictions.yaml` — age/region PAC policy
  (EMEA >18, USA >21, APAC >16 permit; else deny).
- `amountAsCode.yaml` → `policy/amountAsCode.yaml` — amount PAC policy
  (<100 permit, >100 deny).
- `out.txt` (JSON, most recent export, 2026-07-23) →
  `snapshots/content-api-decision-point.json` — reference/backup of the live
  tenant's `ContentAPIDecisionPoint` config.
- `content-api.zip` (JSON, older export, 2026-07-22) → kept alongside as
  older backup, same directory.

## k8s deploy approach

Plain YAML manifests + a `scripts/deploy.sh` wrapper — mirrors AI-DEMO2's
own `k8s/`-numbered-files + `run-k8.sh` convention. Chosen over Helm/
Kustomize because this targets a single demo environment; templating
overhead isn't earning its keep here. `AAM_GATEWAY_SECRET` goes in a k8s
Secret; `PG_AAM_SERVICE_URL` and other non-secret config in a ConfigMap/env.

## Sample data plan

Hand-written catalog, ~8-10 movie/show entries (id, title, minAge, region,
price, description), deliberately spanning both policy boundaries so every
permit/deny branch in both yaml files is demonstrable from the demo page:
some items priced under and over 100; minAge values of 16/18/21 crossed
against EMEA/USA/APAC region combinations.

## Success criteria

- `kubectl apply` (via `scripts/deploy.sh`) brings up all three containers
  in a target k8s cluster with no manual steps beyond setting
  `PG_AAM_SERVICE_URL` / `AAM_GATEWAY_SECRET`.
- From the demo page, a scenario that should PERMIT (e.g. EMEA, age 25,
  amount 50) returns a real catalog item fetched through the gateway.
- A scenario that should DENY (e.g. EMEA, age 15) is blocked at the gateway
  with a visible reason on the demo page, and `content-api` is never hit.
- README documents the console prerequisites clearly enough that a fresh
  tenant can be wired up without guessing.
