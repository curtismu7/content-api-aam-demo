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
