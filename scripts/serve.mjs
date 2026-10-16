import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './validate.mjs';

const directory = path.join(root, 'dist');
if (!fs.existsSync(path.join(directory, 'index.html'))) throw new Error('Run npm run build first.');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png', '.pdf': 'application/pdf', '.md': 'text/plain' };
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const filename = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(directory, filename);
    if (!file.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end('Bad request'); }
});
server.listen(4173, '127.0.0.1', () => console.log('PaperOnBoard: http://127.0.0.1:4173'));
