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
