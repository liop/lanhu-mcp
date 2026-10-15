import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateRawSync } from 'node:zlib';

// Dependency-free ZIP writer for Chrome Web Store. Files are stored or deflated with CRC32.
const root = 'extension-dist';
const outputDir = 'artifacts';
mkdirSync(outputDir, { recursive: true });
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const output = join(outputDir, `lanhu-mcp-extension-v${manifest.version}.zip`);
function scan(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? scan(full) : [full];
  }).sort();
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const chunks = [], central = [];
let offset = 0;
for (const path of scan(root)) {
  const name = Buffer.from(relative(root, path).replaceAll('\\', '/'));
  const input = readFileSync(path), compressed = deflateRawSync(input, { level: 9 });
  const crc = crc32(input);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(input.length, 22);
  local.writeUInt16LE(name.length, 26);
  chunks.push(local, name, compressed);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50, 0);
  directory.writeUInt16LE(20, 4);
  directory.writeUInt16LE(20, 6);
  directory.writeUInt16LE(8, 10);
  directory.writeUInt32LE(crc, 16);
  directory.writeUInt32LE(compressed.length, 20);
  directory.writeUInt32LE(input.length, 24);
  directory.writeUInt16LE(name.length, 28);
  directory.writeUInt32LE(offset, 42);
  central.push(directory, name);
  offset += local.length + name.length + compressed.length;
}
const centralSize = central.reduce((n,b) => n+b.length, 0), count = central.length/2;
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(count, 8);
end.writeUInt16LE(count, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);
writeFileSync(output, Buffer.concat([...chunks, ...central, end]));
console.log(`Packaged ${count} files: ${output}`);
