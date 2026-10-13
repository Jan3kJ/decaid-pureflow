// Where the gateway is. Decaid serves the skin from the same host as the gateway, on another
// port (spec 4.1), so the host is the page's own and the port is 8080.

export const GATEWAY_PORT = 8080;

type PageLocation = Pick<Location, 'protocol' | 'hostname' | 'search'>;

/**
 * The gateway's base URL: port 8080 on the page's own host. `?gateway=http://host:8080` in the
 * page's address names another one, for development against a Decaid on another machine.
 */
export function gatewayBaseUrl(location: PageLocation): string {
  const named = new URLSearchParams(location.search).get('gateway');
  if (named && /^https?:\/\//i.test(named)) return named.replace(/\/+$/, '');
  const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
  const host = location.hostname || 'localhost';
  return `${protocol}//${host}:${GATEWAY_PORT}`;
}
