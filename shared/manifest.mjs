export const MAX_SIZE = 2 * 1024 ** 3;
export function validateManifest(m) {
  if (!m || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(m.id)) throw Error('Use a lowercase app ID with letters, numbers, and hyphens (2–64 characters).');
  for (const [key, max] of [['name',100],['description',2000],['version',40],['publisher',100],['license',100]]) {
    if (typeof m[key] !== 'string' || !m[key].trim() || m[key].length > max) throw Error(`Invalid ${key}.`);
  }
  if (!['app','game'].includes(m.kind)) throw Error('Choose app or game.');
  if (!/^[a-f0-9]{64}$/.test(m.sha256)) throw Error('SHA-256 must be 64 lowercase hexadecimal characters.');
  if (!Number.isSafeInteger(m.size) || m.size < 1 || m.size > MAX_SIZE) throw Error('Package must be between 1 byte and 2 GiB.');
  const u = new URL(m.url);
  if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.port || u.username || u.password || u.search || u.hash || !/^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+\.vfdn$/.test(u.pathname)) throw Error('Use an HTTPS GitHub release asset URL ending in .vfdn.');
  return Object.fromEntries(['id','name','description','kind','version','publisher','url','sha256','size','license'].map(k=>[k,m[k]]));
}
export function trustedService(value) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/') throw Error('Enter a server origin without a path or credentials.');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1','localhost'].includes(u.hostname))) throw Error('Server must use HTTPS, except localhost development.');
  return u.origin;
}
