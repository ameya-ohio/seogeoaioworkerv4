import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * A minimal ZIP reader, just enough to open an .xlsx (which is a ZIP of XML
 * parts). Node ships DEFLATE via zlib but no ZIP container reader, and the
 * only maintained npm option for reading workbooks (exceljs) pulls a
 * vulnerable `uuid` whose only fix is a breaking downgrade. Reading a handful
 * of XML parts once a quarter does not justify that, so the container is
 * parsed here: ~120 lines, no dependencies, no transitive surface.
 *
 * Deliberately NOT a general-purpose ZIP library: no encryption, no ZIP64, no
 * multi-disk archives. Each of those fails loudly rather than silently
 * mis-reading.
 */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const EOCD_MIN_SIZE = 22;
/** ZIP comments are a 16-bit length, so the EOCD is within this of the end. */
const MAX_COMMENT = 0xffff;

export class ZipError extends Error {}

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEocd(buf: Buffer): number {
  const start = Math.max(0, buf.length - (EOCD_MIN_SIZE + MAX_COMMENT));
  for (let i = buf.length - EOCD_MIN_SIZE; i >= start; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new ZipError("not a ZIP archive (no end-of-central-directory record)");
}

function readCentralDirectory(buf: Buffer): CentralEntry[] {
  const eocd = findEocd(buf);
  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  // 0xffff / 0xffffffff are the ZIP64 sentinels. An .xlsx that needs ZIP64 is
  // far outside anything this importer should accept, so say so plainly.
  if (entryCount === 0xffff || cdOffset === 0xffffffff) {
    throw new ZipError("ZIP64 archives are not supported");
  }
  if (cdOffset >= buf.length) throw new ZipError("corrupt ZIP (bad central directory offset)");

  const entries: CentralEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ZipError(`corrupt ZIP (bad central directory entry ${i})`);
    }
    const flags = buf.readUInt16LE(p + 8);
    if (flags & 0x1) throw new ZipError("encrypted ZIP entries are not supported");
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, e: CentralEntry): Buffer {
  const o = e.localHeaderOffset;
  if (o + 30 > buf.length || buf.readUInt32LE(o) !== SIG_LOCAL) {
    throw new ZipError(`corrupt ZIP (bad local header for "${e.name}")`);
  }
  // The local header's own name/extra lengths are authoritative for locating
  // the data; they can legitimately differ from the central directory's.
  const nameLen = buf.readUInt16LE(o + 26);
  const extraLen = buf.readUInt16LE(o + 28);
  const start = o + 30 + nameLen + extraLen;
  const end = start + e.compressedSize;
  if (end > buf.length) throw new ZipError(`corrupt ZIP (truncated data for "${e.name}")`);
  const raw = buf.subarray(start, end);
  if (e.method === 0) return Buffer.from(raw);
  if (e.method === 8) return inflateRawSync(raw);
  throw new ZipError(`unsupported ZIP compression method ${e.method} for "${e.name}"`);
}

/**
 * Read every entry into memory, keyed by its archive path. Workbooks are
 * small enough (the reference 504-row map is 64 KB) that streaming would be
 * complexity for nothing.
 */
export function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const e of readCentralDirectory(buf)) {
    if (e.name.endsWith("/")) continue; // directory entry
    out.set(e.name, readEntry(buf, e));
  }
  return out;
}

/**
 * A minimal ZIP writer for export bundles (D52): DEFLATE entries, no ZIP64,
 * no encryption — a handful of small files per article. Same no-dependency
 * reasoning as the reader above; round-trips through unzip() in the tests.
 */
export function zip(entries: { name: string; data: Buffer | string }[], when = new Date()): Buffer {
  const dosTime = ((when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2)) & 0xffff;
  const dosDate = (((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()) & 0xffff;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf-8");
    const raw = typeof e.data === "string" ? Buffer.from(e.data, "utf-8") : e.data;
    const packed = deflateRawSync(raw);
    const crc = crc32(raw) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(EOCD_MIN_SIZE);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}
