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
