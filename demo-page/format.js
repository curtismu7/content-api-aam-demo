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
