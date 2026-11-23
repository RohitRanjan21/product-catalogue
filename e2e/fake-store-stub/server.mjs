// A stand-in for fakestoreapi.com, used by CI's end-to-end run only.
//
// Fake Store sits behind Cloudflare, which answers requests from cloud runners (GitHub Actions) with
// HTTP 403, so the E2E suite can't reach it from CI. This server answers the two kinds of request our
// adapter makes: `GET /products` (a recorded copy of the real catalogue, in products.json) and the
// product images. Everything between the browser and this server is the real stack.
// See DECISIONS.md D14. No dependencies: run it with `node server.mjs`.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { crc32, deflateSync } from 'node:zlib';

const PORT = Number(process.env.PORT ?? 3001);
const products = JSON.parse(readFileSync(new URL('./products.json', import.meta.url), 'utf8'));
const placeholderImage = solidPng(64, 64, [224, 224, 224]);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method !== 'GET') return send(response, 405, 'text/plain', 'Method not allowed');
  if (url.pathname === '/health') return send(response, 200, 'text/plain', 'ok');

  if (url.pathname === '/products') {
    // Image URLs point back at this server, under whatever host name the API used to reach it.
    const body = products.map((product) => ({ ...product, image: `${url.origin}/img/${product.id}.png` }));
    return send(response, 200, 'application/json', JSON.stringify(body));
  }

  if (/^\/img\/\d+\.png$/.test(url.pathname)) return send(response, 200, 'image/png', placeholderImage);

  return send(response, 404, 'text/plain', 'Not found');
});

server.listen(PORT, '0.0.0.0', () => console.log(`Fake Store stand-in listening on :${PORT}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));

function send(response, status, contentType, body) {
  response.writeHead(status, { 'content-type': contentType, 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

/** A minimal valid PNG of one colour, so product images really load in the browser. */
function solidPng(width, height, [r, g, b]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}
