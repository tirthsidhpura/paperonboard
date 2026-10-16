// Shared by the site, validation tools, and any future page using these catalogs.
export function validateURLSources(sources) {
  if (!sources?.versions || typeof sources.versions !== 'object' || Array.isArray(sources.versions)) {
    throw new Error('URL configuration must contain a versions object.');
  }
  for (const [version, base] of Object.entries(sources.versions)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(version) || typeof base !== 'string') throw new Error('Invalid URL version.');
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !base.endsWith('/')) {
      throw new Error(`URL version ${version} must be an HTTPS base URL ending in /, without credentials, query, or fragment.`);
    }
  }
  return sources;
}

export function resolvePaperURL(reference, sources, code) {
  if (typeof reference.url === 'string') {
    if (reference.urlVersion !== undefined || reference.path !== undefined) throw new Error('Use either url or urlVersion + path.');
    return reference.url.replaceAll('{code}', encodeURIComponent(code ?? ''));
  }
  if (!Object.hasOwn(sources.versions, reference.urlVersion)) throw new Error(`Unknown URL version: ${reference.urlVersion}`);
  const path = reference.path;
  if (typeof path !== 'string' || !path || /^(\/|\.)|[\\:\s\u0000-\u001f]/.test(path) || path.includes('..') || /%2e|%2f|%5c/i.test(path)) {
    throw new Error('Paper path must be relative to its configured base URL.');
  }
  if (path.includes('{code}') && (code === undefined || code === null || code === '')) throw new Error('A subject code is required.');
  return new URL(path.replaceAll('{code}', encodeURIComponent(code ?? '')), sources.versions[reference.urlVersion]).href;
}
