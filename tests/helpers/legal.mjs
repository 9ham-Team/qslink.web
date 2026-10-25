// Model the explicit confirmations made by normal UI submissions. Tests can
// override any field (including with undefined) to exercise refusal/old clients.
export function withLegalConsent(method, route, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const register = method === 'POST' && route === '/api/auth/register';
  const content = (method === 'POST' && route === '/api/cards') ||
    (method === 'PUT' && /^\/api\/cards\/[^/]+$/.test(route));
  return register || content ? { acceptTerms: true, termsVersion: '2026-10-25',
    ...(content ? { acceptContentLicense: true } : {}), ...body } : body;
}
