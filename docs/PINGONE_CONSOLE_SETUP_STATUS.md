# PingOne Authorize AAM console setup — status, 2026-07-27

Working session got partway through the PingOne console prerequisites in
[README.md](../README.md) ("PingOne console prerequisites"). Stopped mid-way
through creating the API Service. This doc is the pickup point.

## Environment

| | |
|---|---|
| PingOne env | `AI-Demo`, id `01d89b06-66d5-430e-9f28-65636843788b` |
| Worker creds used to inspect via API | `demo_api_server/.env` in the AI-DEMO2 repo (`PINGONE_WORKER_CLIENT_ID`/`SECRET`) — read-only for this env, confirmed via `GET /v1/environments/{envId}/gateways` and `/decisionEndpoints` (200 OK) |

## Done

1. **Gateway** — already exists, correct one identified: `PingGateway AAM`,
   id `737420bd-d898-4af1-830c-d7452e5494fa`, type `API_GATEWAY_INTEGRATION`.
   Credential regenerated today, JWT confirmed to decode to this gateway's id
   (`gatewayType: API_GATEWAY_INTEGRATION`, matches). **The raw secret was
   pasted into chat but not saved to any file by me — you need to have it
   saved somewhere yourself (password manager, local gitignored `.env`)
   before tomorrow, or you'll have to regenerate it again.**

2. **`PG_AAM_SERVICE_URL`** — confirmed from the credential JWT's own
   `httpAccessApiUrl` claim, more reliable than the Management API `self`
   href guess I started with:
   ```
   https://http-access-api.pingone.com/v1/environments/01d89b06-66d5-430e-9f28-65636843788b
   ```

3. **Base URL for the new API Service** — this repo has no docker-compose,
   only k8s (`scripts/deploy.sh` builds images then `kubectl apply`s
   `k8s/*.yaml`). `ping-gateway`'s k8s Service is NodePort `30036`, container
   port 8080, no TLS. If running via Docker Desktop/OrbStack's local
   Kubernetes, that's:
   ```
   http://localhost:30036/
   ```
   Confirm this matches whatever cluster you actually deploy to before
   saving — if it's a different cluster/node, the address changes.

4. **"Group" (README step 1) — does not exist, skip it.** Confirmed three
   ways: the live `gateways` API response has no group field, and Ping's own
   docs for both
   [API gateways](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_api_gateways.html)
   and
   [Defining your API in PingOne Authorize](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_add_api_service.html)
   have no group-creation step anywhere. README's step 1 is stale — go
   straight to the gateway/API Service.

5. **API Service creation** — in progress:
   - Authorization > API Services > `[+]`
   - Name: `content-api`
   - Base URL: see #3 above (was wrongly typed as
     `https://local.ping-devops.com:4000/` — that's the *unrelated* AI-DEMO2
     banking demo's URL, fix before saving)
   - Token source: PingOne SSO (default)
   - **Enable Custom Policies**: checked — this is how `ContentAPIDecisionPoint`
     gets attached
   - On the "Define Operation" > "Define Access Rules" screen: **leave all 5
     built-in checkboxes unchecked** (member-of-group / scopes / permission /
     auth-policy / recency). Confirmed from
     [Adding custom policies for API services and operations](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_adding_custom_policies_for_api_services_and_operations.html):
     built-in rules and custom policies are *alternatives*, not layered, and
     none of the 5 checkboxes map to this demo's actual Age/Location/Amount
     logic anyway — that logic lives entirely in the custom policy tree.

6. **Decision point snapshot fixed** — `snapshots/content-api-decision-point.json`
   was a placeholder (`TokenGate`/`ScopeAccess`, OAuth-scope based) that would
   have denied every request in this demo's own README "Try it" examples,
   since none of them send a bearer token. Rewrote it to evaluate
   `Request.Amount`/`Age`/`Location` from `X-Demo-Amount`/`X-Demo-Age`/
   `X-Demo-Location` headers, per `policy/restrictions.yaml` +
   `policy/amountAsCode.yaml`. Committed on branch `fix-decision-point-headers`
   (**not merged to `main`** — that's your call). Not yet imported into the
   console.

## Stuck / not yet done

- **API Service not saved/deployed yet** — Base URL needs fixing first (#3),
  then Save, then Deploy.
- **Operations not yet added** — after the API Service exists, add under its
  Operations tab: `GET /aam/health`, `GET /aam/content`,
  `GET /aam/content/{id}`. I could not confirm the exact sub-screen for this
  from docs (summarized fetch didn't spell it out) — look for an "Operations"
  tab on the API Service detail page after Save/Deploy.
- **Snapshot not imported** — Authorize > Snapshots > Import >
  `snapshots/content-api-decision-point.json` (from the
  `fix-decision-point-headers` branch/worktree, or merge it to `main` first).
- **Header-resolver JSON in the snapshot is UNVERIFIED.** I could not find or
  produce a confirmed-working example of PingOne's exact JSON for extracting
  a *named custom header* (only the general shape — a `Headers` collection +
  JSONPath value processor — is documented, no literal example). Each of the
  3 new attributes (`Request.Amount`/`Age`/`Location`) has this flagged in
  its own `description` field in the snapshot. **After import, test with the
  README's own scenarios** (`glass-frontier`/99 → PERMIT, `echo-chamber`/101
  → DENY, age 15/EMEA → DENY). If Amount/Age/Location come back empty or the
  decision is always DENY/INDETERMINATE regardless of input, open those 3
  attributes in the console's Attributes editor and recreate the resolver
  there with its header picker (the console can't produce invalid syntax;
  my hand-written guess might be wrong). The rest of the policy logic
  (conditions/rules) doesn't depend on the exact resolver shape and should be
  fine as-is.
- **`AmountOverLimit` condition is `Amount > 100`**, matching
  `amountAsCode.yaml`'s `DenyAmount` rule literally. Amount == 100 is
  undefined in the source YAML (neither its `PermitAmount(<100)` nor
  `DenyAmount(>100)` rule matches) — this snapshot resolves that gap toward
  PERMIT rather than inventing a new threshold. Flagging in case you want it
  the other way.
- **Cleanup (optional, not done)**: an extra gateway named `AI-Demo`
  (id `91af5696-fb35-4ef7-9ed4-a8de564ef7db`, type `AUTHORIZE` — the
  self-hosted gateway container product, wrong type for this demo, zero
  connected instances) got created by accident during today's session. Not
  used by anything here; delete it if it bothers you, harmless if left.
- **Not deployed** — `scripts/deploy.sh` not run yet. Needs
  `PG_AAM_SERVICE_URL` and `AAM_GATEWAY_SECRET` exported first (see #1, #2).

## Next steps, in order

1. Fix the Base URL field, Save, Deploy the API Service.
2. Add the 3 Operations.
3. Import the snapshot from `fix-decision-point-headers` (merge to `main`
   first if you want it there).
4. Set `PG_AAM_SERVICE_URL` + `AAM_GATEWAY_SECRET` in a local `.env`
   (gitignored) or export them.
5. `./scripts/deploy.sh` (needs `kubectl` pointed at your target cluster).
6. Test the 3 README scenarios end to end. Fix the header-resolver attributes
   in the console if Amount/Age/Location aren't resolving.
