# Content API AAM Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, k8s-deployable demo of PingOne Authorize's API Access Management (AAM) side-band feature — a static demo page fires requests through PingGateway, PingGateway calls PingOne Authorize's AAM sideband API for a permit/deny decision, and on PERMIT proxies to a sample Content API serving a small movie/show catalog.

**Architecture:** Three containers (`demo-page` static nginx, `ping-gateway` official PingGateway image + one AAM route, `content-api` Node/Express) plus one real external dependency (the user's PingOne Authorize tenant, console-configured by the user separately). No on-prem PDP anywhere in this flow — `PingAuthorizeFilter` calls PingOne Authorize's cloud Sideband API directly.

**Tech Stack:** Node.js 22 (Express, Jest, Supertest, js-yaml), official PingGateway Docker image (`us-docker.pkg.dev/forgeops-public/images-base/ig:latest`), nginx:alpine, plain Kubernetes YAML manifests + a bash deploy script.

## Global Constraints

- No on-prem PingAuthorize PDP container anywhere — AAM's `PingAuthorizeFilter` calls the PingOne Authorize cloud Sideband API directly (confirmed: no such image exists in the source AI-DEMO2 repo, and mocking the decision would defeat the demo's purpose).
- Plain Kubernetes YAML manifests + `scripts/deploy.sh`, not Helm or Kustomize (approved design decision — single target environment, no templating payoff).
- `demo-page` is static HTML/JS, no frontend build step or framework (approved design decision).
- Single root `package.json` for all Node tooling and dependencies across `content-api`, `demo-page`'s test, and `k8s`'s manifest test — avoids npm workspaces overhead for a small demo repo.
- Scenario inputs (amount/age/location) are carried as request headers `X-Demo-Amount`, `X-Demo-Age`, `X-Demo-Location` — confirmed compatible: AAM's `PingAuthorizeFilter` forwards method/path/headers/client-IP to the Sideband API (source: comment in AI-DEMO2's `ping-gateway/config/routes/04-aam-api-access.json`). This closes the spec's previously-open question about header forwarding.
- Repo: https://github.com/curtismu7/content-api-aam-demo (public), `main` branch already has the design spec committed at `docs/superpowers/specs/2026-07-27-content-api-aam-demo-design.md`.
- PingOne console setup (Group, API Gateway, Credential, API Service) is owned by the user — not part of this plan's tasks.

---

### Task 1: Repo scaffolding and seed policy files

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `policy/restrictions.yaml`
- Create: `policy/amountAsCode.yaml`
- Create: `snapshots/content-api-decision-point.json`
- Create: `snapshots/content-api.zip`

**Interfaces:**
- Produces: root `package.json` with `dependencies.express`, `devDependencies.jest`/`supertest`/`js-yaml`, `"scripts": {"test": "jest"}`. All later tasks assume `npm install` has been run and `npm test` runs Jest across the whole repo with default `testMatch` (any `*.test.js`).
- Produces: `policy/`, `snapshots/` — reference-only files, not required at runtime by any code in this repo.

This is scaffolding, not logic — no fail-first test cycle applies. Verification is "the files exist and parse."

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "content-api-aam-demo",
  "version": "0.1.0",
  "private": true,
  "description": "Demo of PingOne Authorize AAM side-band decisioning via PingGateway",
  "scripts": {
    "test": "jest",
    "start:content-api": "node content-api/server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 2: Install dependencies and generate the lockfile**

Run: `npm install`
Expected: completes with no errors, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
.env
```

- [ ] **Step 4: Copy seed policy and snapshot files from AI-DEMO2**

```bash
mkdir -p policy snapshots
cp /Users/cmuir/Development/AI-DEMO2/restrictions.yaml policy/restrictions.yaml
cp /Users/cmuir/Development/AI-DEMO2/amountAsCode.yaml policy/amountAsCode.yaml
cp /Users/cmuir/Development/AI-DEMO2/out.txt snapshots/content-api-decision-point.json
cp /Users/cmuir/Development/AI-DEMO2/content-api.zip snapshots/content-api.zip
```

- [ ] **Step 5: Verify the copied files parse**

Run: `node -e "require('js-yaml').load(require('fs').readFileSync('policy/restrictions.yaml', 'utf8')); require('js-yaml').load(require('fs').readFileSync('policy/amountAsCode.yaml', 'utf8')); JSON.parse(require('fs').readFileSync('snapshots/content-api-decision-point.json', 'utf8')); JSON.parse(require('fs').readFileSync('snapshots/content-api.zip', 'utf8')); console.log('all seed files parse OK')"`
Expected: prints `all seed files parse OK` with no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore policy/ snapshots/
git commit -m "chore: scaffold repo, seed policy and snapshot files from AI-DEMO2"
```

---

### Task 2: content-api service

**Files:**
- Create: `content-api/sample-data.json`
- Create: `content-api/server.js`
- Test: `content-api/server.test.js`

**Interfaces:**
- Consumes: none (first app-logic task).
- Produces: `content-api/server.js` exports `{ createApp }` — `createApp(): express.Application`. Routes: `GET /aam/health` → `{status:'ok'}`; `GET /aam/content` → full catalog array; `GET /aam/content/:id` → single item or 404 `{error:'not_found'}`. `content-api/sample-data.json` — array of `{id, title, minAge, price, description}`. Consumed by Task 5 (`content-api/Dockerfile` runs `node content-api/server.js`).

- [ ] **Step 1: Write the failing tests**

`content-api/server.test.js`:

```js
const request = require('supertest');
const { createApp } = require('./server');

describe('content-api', () => {
  const app = createApp();

  test('GET /aam/health returns ok', async () => {
    const res = await request(app).get('/aam/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('GET /aam/content returns full catalog', async () => {
    const res = await request(app).get('/aam/content');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /aam/content/:id returns matching item', async () => {
    const list = await request(app).get('/aam/content');
    const target = list.body[0];
    const res = await request(app).get(`/aam/content/${target.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(target);
  });

  test('GET /aam/content/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/aam/content/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest content-api/server.test.js`
Expected: FAIL — `Cannot find module './server'`.

- [ ] **Step 3: Write the sample catalog**

`content-api/sample-data.json`:

```json
[
  { "id": "the-last-circuit", "title": "The Last Circuit", "minAge": 13, "price": 50, "description": "A hacker duo race to stop a rogue AI trading algorithm." },
  { "id": "neon-horizon", "title": "Neon Horizon", "minAge": 16, "price": 75, "description": "A courier navigates a neon-lit megacity chasing a stolen prototype." },
  { "id": "quantum-heist", "title": "Quantum Heist", "minAge": 18, "price": 120, "description": "A crew attempts to rob a bank that exists in two timelines at once." },
  { "id": "midnight-protocol", "title": "Midnight Protocol", "minAge": 21, "price": 45, "description": "A retired spy is pulled back in for one last data extraction." },
  { "id": "silent-ledger", "title": "Silent Ledger", "minAge": 18, "price": 200, "description": "An auditor uncovers a conspiracy hidden inside a bank's transaction logs." },
  { "id": "the-analyst", "title": "The Analyst", "minAge": 16, "price": 30, "description": "A junior analyst spots a pattern nobody else believes is real." },
  { "id": "zero-trust", "title": "Zero Trust", "minAge": 21, "price": 150, "description": "A security team locks down a compromised network from the inside out." },
  { "id": "paper-moon-rising", "title": "Paper Moon Rising", "minAge": 13, "price": 20, "description": "Two siblings run a small con across a chain of struggling towns." },
  { "id": "glass-frontier", "title": "Glass Frontier", "minAge": 18, "price": 99, "description": "Settlers on a transparent orbital station face a structural crisis." },
  { "id": "echo-chamber", "title": "Echo Chamber", "minAge": 21, "price": 101, "description": "A journalist traces a disinformation campaign back to its source." }
]
```

- [ ] **Step 4: Write the minimal implementation**

`content-api/server.js`:

```js
const express = require('express');
const catalog = require('./sample-data.json');

function createApp() {
  const app = express();

  app.get('/aam/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/aam/content', (req, res) => {
    res.json(catalog);
  });

  app.get('/aam/content/:id', (req, res) => {
    const item = catalog.find((entry) => entry.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(item);
  });

  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const port = process.env.PORT || 8080;
  createApp().listen(port, () => {
    console.log(`content-api listening on ${port}`);
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest content-api/server.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add content-api/sample-data.json content-api/server.js content-api/server.test.js
git commit -m "feat: add content-api service with sample catalog"
```

---

### Task 3: ping-gateway AAM route config

**Files:**
- Create: `ping-gateway/config/config.json`
- Create: `ping-gateway/config/routes/aam-content-access.json`
- Test: `ping-gateway/route.test.js`

**Interfaces:**
- Consumes: none directly, but `PG_CONTENT_API_BACKEND_URL` env var (default `http://content-api:8080`) must resolve to Task 2's `content-api` service at runtime.
- Produces: exact file paths `ping-gateway/config/config.json` and `ping-gateway/config/routes/aam-content-access.json`. Consumed by Task 6 (k8s ConfigMap generation via `--from-file`) and Task 7 (`deploy.sh` references these same paths).

- [ ] **Step 1: Write the failing test**

`ping-gateway/route.test.js`:

```js
const fs = require('fs');
const path = require('path');

describe('AAM route config', () => {
  const routePath = path.join(__dirname, 'config', 'routes', 'aam-content-access.json');
  const configPath = path.join(__dirname, 'config', 'config.json');

  test('route has PingAuthorizeFilter as first filter', () => {
    const route = JSON.parse(fs.readFileSync(routePath, 'utf8'));
    const filters = route.handler.config.filters;
    expect(filters[0].type).toBe('PingAuthorizeFilter');
  });

  test('PingAuthorizeFilter references the SecretsStore-backed credential', () => {
    const route = JSON.parse(fs.readFileSync(routePath, 'utf8'));
    const filter = route.handler.config.filters[0];
    expect(filter.config.secretsProvider).toBe('SecretsStore');
    expect(filter.config.gatewayCredentialSecretId).toBe('aam.gateway.secret');
  });

  test('condition gates on PG_AAM_SERVICE_URL and the /aam path prefix', () => {
    const route = JSON.parse(fs.readFileSync(routePath, 'utf8'));
    expect(route.condition).toContain("env['PG_AAM_SERVICE_URL']");
    expect(route.condition).toContain("'^/aam'");
  });

  test('config.json declares a matching SecretsStore heap object', () => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const secretsStore = config.heap.find((entry) => entry.name === 'SecretsStore');
    expect(secretsStore).toBeDefined();
    expect(secretsStore.type).toBe('SystemAndEnvSecretStore');
    expect(secretsStore.config.format).toBe('PLAIN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest ping-gateway/route.test.js`
Expected: FAIL — `ENOENT: no such file or directory` on `config.json`.

- [ ] **Step 3: Write `ping-gateway/config/config.json`**

```json
{
  "heap": [
    {
      "name": "SecretsStore",
      "type": "SystemAndEnvSecretStore",
      "config": { "format": "PLAIN" }
    }
  ],
  "handler": { "type": "Router" }
}
```

- [ ] **Step 4: Write `ping-gateway/config/routes/aam-content-access.json`**

```json
{
  "name": "aam-content-access",
  "condition": "${not empty env['PG_AAM_SERVICE_URL'] and find(request.uri.path, '^/aam')}",
  "handler": {
    "type": "Chain",
    "config": {
      "filters": [
        {
          "name": "AamDecision",
          "type": "PingAuthorizeFilter",
          "config": {
            "gatewayServiceUri": "&{pg.aam.service.url|https://aam-not-configured.invalid}",
            "secretsProvider": "SecretsStore",
            "gatewayCredentialSecretId": "aam.gateway.secret"
          }
        }
      ],
      "handler": {
        "type": "ReverseProxyHandler",
        "baseURI": "${empty env['PG_CONTENT_API_BACKEND_URL'] ? 'http://content-api:8080' : env['PG_CONTENT_API_BACKEND_URL']}",
        "config": {}
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest ping-gateway/route.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add ping-gateway/config ping-gateway/route.test.js
git commit -m "feat: add PingGateway AAM route config"
```

---

### Task 4: demo-page frontend

**Files:**
- Create: `demo-page/format.js`
- Create: `demo-page/app.js`
- Create: `demo-page/index.html`
- Test: `demo-page/format.test.js`

**Interfaces:**
- Consumes: none.
- Produces: `demo-page/format.js` exports `{ formatResult(status, body) }` — dual CommonJS (for the Jest test) and browser-global (for `index.html`'s plain `<script>` tag) — returns `{verdict, message, data}` where `verdict` is one of `PERMIT`/`DENY`/`NOT_FOUND`/`ERROR`. `app.js` fetches relative paths `/aam/content` or `/aam/content/:id` (same-origin — see Task 5's nginx proxy) with headers `X-Demo-Amount`/`X-Demo-Age`/`X-Demo-Location` when the corresponding form fields are filled. Consumed by Task 5 (`demo-page/Dockerfile` copies these 3 files verbatim).

- [ ] **Step 1: Write the failing test**

`demo-page/format.test.js`:

```js
const { formatResult } = require('./format');

describe('formatResult', () => {
  test('2xx status returns PERMIT verdict', () => {
    const result = formatResult(200, { title: 'Zero Trust' });
    expect(result.verdict).toBe('PERMIT');
    expect(result.message).toContain('Zero Trust');
  });

  test('403 status returns DENY verdict', () => {
    const result = formatResult(403, { error: 'access_denied' });
    expect(result.verdict).toBe('DENY');
  });

  test('404 status returns NOT_FOUND verdict', () => {
    const result = formatResult(404, { error: 'not_found' });
    expect(result.verdict).toBe('NOT_FOUND');
  });

  test('unexpected status returns ERROR verdict', () => {
    const result = formatResult(500, { error: 'boom' });
    expect(result.verdict).toBe('ERROR');
    expect(result.message).toContain('500');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest demo-page/format.test.js`
Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 3: Write `demo-page/format.js`**

```js
function formatResult(status, body) {
  if (status >= 200 && status < 300) {
    return { verdict: 'PERMIT', message: `Access granted — ${body.title || 'catalog loaded'}`, data: body };
  }
  if (status === 403) {
    return { verdict: 'DENY', message: 'Access denied by PingOne Authorize', data: body };
  }
  if (status === 404) {
    return { verdict: 'NOT_FOUND', message: 'Item not found', data: body };
  }
  return { verdict: 'ERROR', message: `Unexpected response (${status})`, data: body };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatResult };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest demo-page/format.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write `demo-page/app.js`**

```js
async function runScenario(event) {
  event.preventDefault();
  const form = event.target;
  const itemId = form.itemId.value.trim();
  const amount = form.amount.value.trim();
  const age = form.age.value.trim();
  const location = form.location.value.trim();

  const path = itemId ? `/aam/content/${itemId}` : '/aam/content';

  const headers = {};
  if (amount) headers['X-Demo-Amount'] = amount;
  if (age) headers['X-Demo-Age'] = age;
  if (location) headers['X-Demo-Location'] = location;

  const resultEl = document.getElementById('result');
  resultEl.textContent = 'Sending request...';

  try {
    const response = await fetch(path, { headers });
    let body;
    try {
      body = await response.json();
    } catch (err) {
      body = { raw: await response.text() };
    }
    const formatted = formatResult(response.status, body);
    resultEl.textContent = `${formatted.verdict}: ${formatted.message}\n\n${JSON.stringify(formatted.data, null, 2)}`;
  } catch (err) {
    resultEl.textContent = `Request failed: ${err.message}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('scenario-form').addEventListener('submit', runScenario);
});
```

- [ ] **Step 6: Write `demo-page/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Content API AAM Demo</title>
</head>
<body>
  <h1>Content API — PingOne Authorize AAM Demo</h1>
  <form id="scenario-form">
    <label>Content item ID (blank = list all)
      <input type="text" name="itemId" placeholder="e.g. glass-frontier" />
    </label>
    <label>X-Demo-Amount
      <input type="text" name="amount" placeholder="e.g. 50" />
    </label>
    <label>X-Demo-Age
      <input type="text" name="age" placeholder="e.g. 25" />
    </label>
    <label>X-Demo-Location
      <input type="text" name="location" placeholder="EMEA / USA / APAC" />
    </label>
    <button type="submit">Send request</button>
  </form>
  <pre id="result"></pre>
  <script src="format.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 7: Commit**

```bash
git add demo-page/format.js demo-page/format.test.js demo-page/app.js demo-page/index.html
git commit -m "feat: add demo-page frontend"
```

---

### Task 5: Containerize content-api and demo-page

**Files:**
- Create: `content-api/Dockerfile`
- Create: `demo-page/Dockerfile`
- Create: `demo-page/nginx.conf`

**Interfaces:**
- Consumes: Task 2's `content-api/server.js` (via `CMD ["node", "content-api/server.js"]`); Task 4's `demo-page/index.html`, `format.js`, `app.js`.
- Produces: two buildable images. `demo-page`'s nginx proxies `/aam/` to `http://ping-gateway:8080/aam/` so the browser's `fetch` calls in `app.js` stay same-origin (avoids CORS entirely — no CORS filter needed in the IG route). Consumed by Task 7 (`deploy.sh` builds `-f content-api/Dockerfile` and `-f demo-page/Dockerfile` with repo root as build context).

No unit test applies to Dockerfiles/nginx config — verification is running the actual build and a syntax check.

- [ ] **Step 1: Write `content-api/Dockerfile`**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY content-api ./content-api
EXPOSE 8080
CMD ["node", "content-api/server.js"]
```

- [ ] **Step 2: Write `demo-page/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /aam/ {
        proxy_pass http://ping-gateway:8080/aam/;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

- [ ] **Step 3: Write `demo-page/Dockerfile`**

```dockerfile
FROM nginx:alpine
COPY demo-page/index.html demo-page/format.js demo-page/app.js /usr/share/nginx/html/
COPY demo-page/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 4: Build both images from repo root and verify they build**

Run: `docker build -f content-api/Dockerfile -t content-api-aam-demo-content-api:test .`
Expected: build completes, ends with `Successfully tagged` (or BuildKit's equivalent final `naming to ... done`).

Run: `docker build -f demo-page/Dockerfile -t content-api-aam-demo-demo-page:test .`
Expected: build completes successfully.

- [ ] **Step 5: Verify the nginx config is syntactically valid**

Run: `docker run --rm content-api-aam-demo-demo-page:test nginx -t`
Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`.

- [ ] **Step 6: Verify content-api runs and serves the catalog**

Run: `docker run --rm -d -p 18080:8080 --name content-api-smoke content-api-aam-demo-content-api:test && sleep 1 && curl -s http://localhost:18080/aam/health && docker stop content-api-smoke`
Expected: `{"status":"ok"}` printed before the container stops.

- [ ] **Step 7: Commit**

```bash
git add content-api/Dockerfile demo-page/Dockerfile demo-page/nginx.conf
git commit -m "feat: containerize content-api and demo-page"
```

---

### Task 6: Kubernetes manifests

**Files:**
- Create: `k8s/00-namespace.yaml`
- Create: `k8s/01-configmap.yaml`
- Create: `k8s/02-secret.yaml`
- Create: `k8s/10-content-api.yaml`
- Create: `k8s/20-ping-gateway.yaml`
- Create: `k8s/30-demo-page.yaml`
- Test: `k8s/manifests.test.js`

**Interfaces:**
- Consumes: Task 5's image names (`content-api-aam-demo-content-api`, `content-api-aam-demo-demo-page`, parameterized via `${IMAGE_REGISTRY}`/`${IMAGE_TAG}`); Task 3's file paths (referenced by `deploy.sh` in Task 7, not directly by these YAML files).
- Produces: namespace `content-api-aam-demo`; ConfigMap `content-api-aam-demo-config`; Secret `content-api-aam-demo-secret`; Deployments/Services named `content-api`, `ping-gateway`, `demo-page`. Consumed by Task 7's `deploy.sh`, which applies these in numeric-prefix order and generates one additional ConfigMap (`ping-gateway-routes`) dynamically from Task 3's files.

- [ ] **Step 1: Write the failing test**

`k8s/manifests.test.js`:

```js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const k8sDir = __dirname;
const files = fs.readdirSync(k8sDir).filter((f) => f.endsWith('.yaml'));

describe('k8s manifests', () => {
  test('at least one manifest file exists', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  files.forEach((file) => {
    test(`${file} parses as valid YAML with required top-level keys`, () => {
      const raw = fs.readFileSync(path.join(k8sDir, file), 'utf8');
      const docs = yaml.loadAll(raw);
      docs.forEach((doc) => {
        expect(doc).toHaveProperty('apiVersion');
        expect(doc).toHaveProperty('kind');
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest k8s/manifests.test.js`
Expected: FAIL — `expected 0 to be greater than 0` (no `.yaml` files exist yet).

- [ ] **Step 3: Write `k8s/00-namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: content-api-aam-demo
```

- [ ] **Step 4: Write `k8s/01-configmap.yaml`**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: content-api-aam-demo-config
  namespace: content-api-aam-demo
data:
  PG_AAM_SERVICE_URL: "${PG_AAM_SERVICE_URL}"
  PG_CONTENT_API_BACKEND_URL: "http://content-api:8080"
```

- [ ] **Step 5: Write `k8s/02-secret.yaml`**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: content-api-aam-demo-secret
  namespace: content-api-aam-demo
type: Opaque
stringData:
  AAM_GATEWAY_SECRET: "${AAM_GATEWAY_SECRET}"
```

- [ ] **Step 6: Write `k8s/10-content-api.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: content-api
  namespace: content-api-aam-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: content-api
  template:
    metadata:
      labels:
        app: content-api
    spec:
      containers:
        - name: content-api
          image: "${IMAGE_REGISTRY}content-api-aam-demo-content-api:${IMAGE_TAG}"
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: content-api
  namespace: content-api-aam-demo
spec:
  selector:
    app: content-api
  ports:
    - port: 8080
      targetPort: 8080
```

- [ ] **Step 7: Write `k8s/20-ping-gateway.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ping-gateway
  namespace: content-api-aam-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ping-gateway
  template:
    metadata:
      labels:
        app: ping-gateway
    spec:
      containers:
        - name: ping-gateway
          image: us-docker.pkg.dev/forgeops-public/images-base/ig:latest
          command: ["/bin/sh", "-c"]
          args:
            - "rm -f /var/gateway/tmp/ig.pid && exec /opt/gateway/bin/start.sh /var/gateway"
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: content-api-aam-demo-config
            - secretRef:
                name: content-api-aam-demo-secret
          volumeMounts:
            - name: ig-config
              mountPath: /var/gateway/config
              readOnly: true
            - name: ig-instance
              mountPath: /var/gateway/tmp
      volumes:
        - name: ig-config
          configMap:
            name: ping-gateway-routes
            items:
              - key: config.json
                path: config.json
              - key: aam-content-access.json
                path: routes/aam-content-access.json
        - name: ig-instance
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: ping-gateway
  namespace: content-api-aam-demo
spec:
  selector:
    app: ping-gateway
  ports:
    - port: 8080
      targetPort: 8080
      nodePort: 30036
  type: NodePort
```

- [ ] **Step 8: Write `k8s/30-demo-page.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-page
  namespace: content-api-aam-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: demo-page
  template:
    metadata:
      labels:
        app: demo-page
    spec:
      containers:
        - name: demo-page
          image: "${IMAGE_REGISTRY}content-api-aam-demo-demo-page:${IMAGE_TAG}"
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: demo-page
  namespace: content-api-aam-demo
spec:
  selector:
    app: demo-page
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080
  type: NodePort
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest k8s/manifests.test.js`
Expected: PASS — 7 tests (1 file-count test + 6 per-file parse tests).

- [ ] **Step 10: Commit**

```bash
git add k8s/
git commit -m "feat: add k8s manifests for content-api, ping-gateway, demo-page"
```

---

### Task 7: Deploy script, README, and end-to-end verification

**Files:**
- Create: `scripts/deploy.sh`
- Create: `README.md`

**Interfaces:**
- Consumes: Task 3's `ping-gateway/config/config.json` and `ping-gateway/config/routes/aam-content-access.json` paths (for the dynamically-generated `ping-gateway-routes` ConfigMap); Task 5's Dockerfile paths; Task 6's `k8s/*.yaml` paths.
- Produces: a single `./scripts/deploy.sh` entry point and the repo's top-level documentation. Terminal task — no later task depends on this one.

- [ ] **Step 1: Write `scripts/deploy.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  # shellcheck disable=SC1091
  source .env
fi

: "${PG_AAM_SERVICE_URL:?Set PG_AAM_SERVICE_URL (PingOne console: Authorization > API Gateways > Service URL)}"
: "${AAM_GATEWAY_SECRET:?Set AAM_GATEWAY_SECRET (PingOne console: Authorization > API Gateways > Credentials)}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "Building images..."
docker build -f content-api/Dockerfile -t "${IMAGE_REGISTRY}content-api-aam-demo-content-api:${IMAGE_TAG}" .
docker build -f demo-page/Dockerfile -t "${IMAGE_REGISTRY}content-api-aam-demo-demo-page:${IMAGE_TAG}" .

if [ -n "$IMAGE_REGISTRY" ]; then
  echo "Pushing images to $IMAGE_REGISTRY..."
  docker push "${IMAGE_REGISTRY}content-api-aam-demo-content-api:${IMAGE_TAG}"
  docker push "${IMAGE_REGISTRY}content-api-aam-demo-demo-page:${IMAGE_TAG}"
fi

echo "Applying namespace..."
kubectl apply -f k8s/00-namespace.yaml

echo "Applying config and secret..."
PG_AAM_SERVICE_URL="$PG_AAM_SERVICE_URL" envsubst < k8s/01-configmap.yaml | kubectl apply -f -
AAM_GATEWAY_SECRET="$AAM_GATEWAY_SECRET" envsubst < k8s/02-secret.yaml | kubectl apply -f -

echo "Generating ping-gateway route ConfigMap from source..."
kubectl create configmap ping-gateway-routes \
  --namespace content-api-aam-demo \
  --from-file=config.json=ping-gateway/config/config.json \
  --from-file=aam-content-access.json=ping-gateway/config/routes/aam-content-access.json \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Applying deployments and services..."
IMAGE_REGISTRY="$IMAGE_REGISTRY" IMAGE_TAG="$IMAGE_TAG" envsubst < k8s/10-content-api.yaml | kubectl apply -f -
kubectl apply -f k8s/20-ping-gateway.yaml
IMAGE_REGISTRY="$IMAGE_REGISTRY" IMAGE_TAG="$IMAGE_TAG" envsubst < k8s/30-demo-page.yaml | kubectl apply -f -

echo "Done. Check status with: kubectl get pods -n content-api-aam-demo"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/deploy.sh`

- [ ] **Step 3: Write `README.md`**

```markdown
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
   and `Request.Location` by reading them from request headers — this demo
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
(part of `gettext` — `brew install gettext` on macOS if missing).

## Try it

Port-forward or use the `demo-page` service's NodePort (30080), fill in a
scenario, and send a request. Examples using the seeded catalog
(`content-api/sample-data.json`):

- **PERMIT (amount)**: item `glass-frontier` (price 99), age/location that
  satisfies `restrictions.yaml`.
- **DENY (amount)**: item `echo-chamber` (price 101).
- **DENY (age/region)**: `X-Demo-Age: 15`, `X-Demo-Location: EMEA`.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy.sh README.md
git commit -m "feat: add deploy script and README"
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all suites pass (`content-api/server.test.js`, `ping-gateway/route.test.js`, `demo-page/format.test.js`, `k8s/manifests.test.js`).

- [ ] **Step 6: Verify against spec success criteria**

Manually confirm, once console setup is done and `scripts/deploy.sh` has been run against a real cluster with real `PG_AAM_SERVICE_URL`/`AAM_GATEWAY_SECRET`:
- `kubectl get pods -n content-api-aam-demo` shows all three pods Running.
- A PERMIT scenario (e.g. `glass-frontier`, age/location satisfying the policy) returns the catalog item through the demo page.
- A DENY scenario (e.g. `echo-chamber`, price 101) is blocked at the gateway with a visible reason, and `content-api` logs show it was never hit.
