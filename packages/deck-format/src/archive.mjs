import { unzipSync, strFromU8 } from 'fflate';
import {sha256 as portableSHA256} from '@noble/hashes/sha2.js';
import { parseEmbeddedCovers } from './covers.mjs';
import {parseEmbeddedAudio} from './audio.mjs';

export const MAX_PACKAGE_BYTES = 128 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 160 * 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const jsonLimit = path => path === 'manifest.json' ? 8 * 1024 * 1024 : MAX_JSON_BYTES;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/;
const fail = message => { throw new Error(message); };
const text = (value, limit = 2000) => typeof value === 'string' && value.length <= limit ? value : '';
export async function sha256(bytes) {
  // LAN HTTP origins do not expose SubtleCrypto. Keep the same SHA-256
  // verification there using the implementation already used by backups.
  const subtle=globalThis.crypto?.subtle;
  const digest=subtle
    ? new Uint8Array(await subtle.digest('SHA-256', bytes))
    : portableSHA256(bytes instanceof ArrayBuffer?new Uint8Array(bytes):new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength));
  return [...digest].map(n => n.toString(16).padStart(2, '0')).join('');
}
function safePath(path) {
  return typeof path === 'string' && path.length <= 200 && !path.includes('\\') && !path.startsWith('/') && !path.split('/').some(s => ['.', '..', '__proto__', 'constructor', 'prototype', ''].includes(s)) && !/[\x00-\x1f:]/.test(path);
}
function mime(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return 'image/png';
  return fail('这份卡组含浏览器暂不支持的图片，请在 App 中导出 JPEG 或 PNG 卡组。');
}
/** Parse the existing iPhone/Studio archive. No uploads, filesystem extraction, or executable media. */
export async function parseArchive(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_PACKAGE_BYTES) fail('请选择不超过 128 MiB 的 .piclexdeck 卡组。');
  let total = 0, count = 0;
  const names = new Set();
  let files;
  try {
    files = unzipSync(bytes, { filter: file => {
      total += file.originalSize; count++;
      if (!safePath(file.name) || names.has(file.name) || count > 2001 || total > MAX_EXPANDED_BYTES || file.originalSize > MAX_PACKAGE_BYTES || (file.name.endsWith('.json') && file.originalSize > jsonLimit(file.name))) fail('卡组结构或解压大小超出支持范围。');
      names.add(file.name); return true;
    } });
  } catch { fail('卡组损坏或解压大小超出限制，请重新导出。'); }
  const json = path => {
    if (!safePath(path) || !Object.hasOwn(files, path) || files[path].length > jsonLimit(path)) fail('卡组缺少有效的清单文件。');
    try {
      const value = JSON.parse(strFromU8(files[path]));
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('卡组清单格式无效。');
      return value;
    } catch { return fail('卡组清单不是有效的 JSON 对象。'); }
  };
  const manifest = json('manifest.json');
  if (manifest.formatIdentifier !== 'com.zhaoolee.piclex.photo-archive' || manifest.formatVersion !== 1 || !Array.isArray(manifest.photos) || manifest.photos.length < 1 || manifest.photos.length > 500 || manifest.photoCount !== manifest.photos.length || manifest.trashCount !== 0) fail('请选择 摄影学英语 照片卡组，不支持完整备份或未知版本。');
  const photos = [], words = [], ids = new Set();
  for (const item of manifest.photos) {
    if (!item || typeof item !== 'object' || !uuid.test(item.id) || ids.has(item.id.toLowerCase()) || !safePath(item.jsonPath) || !hash.test(item.jsonSHA256) || !Object.hasOwn(files, item.jsonPath) || await sha256(files[item.jsonPath]) !== item.jsonSHA256) fail('照片清单校验失败，原有卡组未改变。');
    ids.add(item.id.toLowerCase());
    const meta = json(item.jsonPath);
    const image = files[meta.imagePath];
    if (meta.formatVersion !== 1 || meta.id !== item.id || meta.deletedAt != null || !safePath(meta.imagePath) || !image || image.length !== meta.imageByteCount || !hash.test(meta.imageSHA256) || await sha256(image) !== meta.imageSHA256) fail('照片内容校验失败，原有卡组未改变。');
    if (!Array.isArray(meta.labels) || meta.labels.length > 1000) fail('卡组词汇格式无效。');
    const imageIndex = photos.length;
    const title = text(meta.title).trim();
    photos.push({ id: item.id, bytes: image, mime: mime(image), ...(title ? { title } : {}) });
    for (const [index, label] of meta.labels.entries()) {
      if (!label || typeof label !== 'object') fail('卡组词汇格式无效。');
      const english = text(label.english, 100).trim(), chinese = text(label.chinese, 200).trim();
      if (!english || !chinese || !/[a-z]/i.test(english) || !/^[a-z0-9\s'’.,!?()\-‐‑‒–—−]+$/i.test(english)) fail('卡组包含暂不支持的词条，请使用英文单词或短语。');
      const box = label.boundingBox;
      const visible = label.positionUnavailable !== true && (!label.learning || label.learning.relation === 'visible');
      const normalized = box && [box.left, box.top, box.right, box.bottom].every(Number.isFinite) && box.left >= 0 && box.top >= 0 && box.right > box.left && box.bottom > box.top && box.right <= 1000 && box.bottom <= 1000
        ? [box.left / 1000, box.top / 1000, (box.right - box.left) / 1000, (box.bottom - box.top) / 1000] : null;
      const audio=await parseEmbeddedAudio(label.learning?.audio);
      words.push({ ...(audio?{audio}:{}), id: `${item.id}:${index}`, english, chinese, imageIndex, focus: visible && normalized ? { visible: true, box: normalized } : null,
        occurrenceID: text(label.learning?.occurrenceID, 200), example: text(label.learning?.example), exampleChinese: text(label.learning?.exampleChinese), phonetic: text(label.phoneticUS, 200), partOfSpeech: text(label.learning?.partOfSpeech, 50) });
      if (words.length > 5000) fail('卡组词汇过多，请拆分为 5000 词以内。');
    }
  }
  if (!words.length) fail('这份卡组还没有可练习的单词。');
  const covers = await parseEmbeddedCovers(manifest.covers);
  const learningFingerprint = await sha256(new TextEncoder().encode(JSON.stringify({ photos: await Promise.all(photos.map(async p => ({ id: p.id, sha256: await sha256(p.bytes) }))), words:words.map(({audio,...word})=>word) })));
  return { fingerprint: await sha256(bytes), learningFingerprint, covers, title: text(manifest.deckName, 80).trim() || '我的照片卡组', photos, words };
}
