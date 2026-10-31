// `npm run serve-release`: serves the ZIPs of `release/` to a tablet in the same network, so a
// build is installed from the skin's settings (Settings > Skin > Developer) before it is
// published. Node only, read only, on all interfaces, port 24810 (`--port`, `--dir`).
// `GET /index.json` lists every ZIP as `{ name, size, modified, sha256 }`, the sum from
// `SHA256SUMS.txt` where it has the line; `GET /<file>` sends a file that lies directly in the
// folder. Every answer carries `Access-Control-Allow-Origin: *`, so the skin's page, served by
// Decaid from another origin, can read the listing.
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The script's own port; Decaid's skins use 24800 and up from the bottom, 8080 is its gateway. */
export const PORT = 24810;

const CORS = { 'Access-Control-Allow-Origin': '*' };

/** The sums of `SHA256SUMS.txt` (`<hex>  <name>` per line) by file name; empty without the file. */
export function readSums(dir) {
  const path = join(dir, 'SHA256SUMS.txt');
  if (!existsSync(path)) return {};
  const sums = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([0-9a-f]{64}) [ *]?(.+)$/i.exec(line.trim());
    if (match) sums[match[2]] = match[1].toLowerCase();
  }
  return sums;
}

/** The folder's ZIPs, newest first: name, size in bytes, modified as ISO time, sha256 or null. */
export function listZips(dir) {
  const sums = readSums(dir);
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.zip'))
    .map((entry) => {
      const stat = statSync(join(dir, entry.name));
      return { name: entry.name, size: stat.size, modified: stat.mtime.toISOString(), sha256: sums[entry.name] ?? null };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified) || a.name.localeCompare(b.name));
}

/** A request path's file name when it names a file directly in the folder, else null. */
export function fileName(pathname) {
  let name;
  try {
    name = decodeURIComponent(pathname.replace(/^\//, ''));
  } catch {
    return null;
  }
  if (name === '' || name === '.' || name === '..' || /[/\\:\0]/.test(name)) return null;
  return name;
}

/** The server for one folder; not yet listening. */
export function makeServer(dir) {
  const root = resolve(dir);
  return createServer((request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { ...CORS, 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': '*' });
      return response.end();
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { ...CORS, Allow: 'GET, HEAD' });
      return response.end();
    }
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname === '/index.json') {
      const body = JSON.stringify(listZips(root));
      response.writeHead(200, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return response.end(request.method === 'HEAD' ? undefined : body);
    }
    const name = fileName(pathname);
    const path = name === null ? null : join(root, name);
    if (path === null || !existsSync(path) || !statSync(path).isFile()) {
      response.writeHead(404, { ...CORS, 'Content-Type': 'text/plain' });
      return response.end('not found');
    }
    const type = name.toLowerCase().endsWith('.zip') ? 'application/zip' : 'application/octet-stream';
    response.writeHead(200, { ...CORS, 'Content-Type': type, 'Content-Length': statSync(path).size, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') return response.end();
    createReadStream(path).pipe(response);
  });
}

/** The machine's IPv4 addresses in its networks, the ones a tablet can reach. */
export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

/** `--port <n>` and `--dir <folder>`, also as `--port=<n>`. */
export function parseArgs(argv) {
  const options = { port: PORT, dir: 'release' };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=', 2);
    const value = () => inline ?? argv[++i];
    if (flag === '--port') options.port = Number(value());
    else if (flag === '--dir') options.dir = value();
    else throw new Error(`unknown option ${argv[i]}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('--port needs a port number');
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const { port, dir } = parseArgs(process.argv.slice(2));
    if (!existsSync(dir)) throw new Error(`${dir}/ does not exist; npm run zip or npm run release -- --local writes it`);
    const zips = listZips(dir);
    makeServer(dir).listen(port, () => {
      console.log(`serve-release: ${zips.length} ZIPs of ${dir}/ on port ${port}, Ctrl+C stops`);
      for (const zip of zips) console.log(`  ${zip.name}`);
      const addresses = lanAddresses();
      console.log(addresses.length ? 'In the skin, Settings > Skin > Developer, enter one of:' : 'No network address found.');
      for (const address of addresses) console.log(`  ${address}:${port}`);
    });
  } catch (error) {
    console.error(`serve-release: ${error.message}`);
    process.exit(1);
  }
}
