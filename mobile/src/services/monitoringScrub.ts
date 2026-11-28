// Addresses in crash reports keep their shape, never whose they are: ids, long numbers and query
// strings are replaced, so /users/8f3a…/flowers/42?x=y becomes /users/:id/flowers/:id.
const ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-z]{20,}|\d+)$/i;

export function scrubUrl(value: string) {
  if (!value) return value;
  const [beforeQuery] = value.split(/[?#]/);
  const match = /^([a-z]+:\/\/[^/]+)?(.*)$/i.exec(beforeQuery);
  const origin = match?.[1] ?? '', path = match?.[2] ?? '';
  return origin + path.split('/').map(part => (ID.test(part) ? ':id' : part)).join('/');
}
