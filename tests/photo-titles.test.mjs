import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { parseArchive, sha256 } from '../packages/deck-format/src/archive.mjs';
import { parsePublicDeck } from '../packages/deck-format/src/public.mjs';

test('photo titles are optional display metadata and preserve learning identity', async () => {
  const original = await readFile(new URL('./fixtures/demo/decks/cafe.piclexdeck', import.meta.url));
  const legacy = await parseArchive(original);
  assert.equal(legacy.photos[0].title, undefined);

  const files = unzipSync(original);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  const photo = manifest.photos[0];
  const metadata = JSON.parse(strFromU8(files[photo.jsonPath]));
  const title = 'Lesson 1 · A Private Conversation';
  files[photo.jsonPath] = strToU8(JSON.stringify({ ...metadata, title: ' ' + title + ' ' }));
  photo.jsonSHA256 = await sha256(files[photo.jsonPath]);
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  const titled = await parseArchive(zipSync(files));

  assert.equal(titled.photos[0].title, title);
  assert.equal(titled.learningFingerprint, legacy.learningFingerprint);
  assert.deepEqual(titled.words, legacy.words);

  const deckID = '00000000-0000-4000-8000-000000000001';
  const { fingerprint, learningFingerprint, words } = titled;
  const publicPhoto = { id: photo.id, path: 'library/example/photo.jpg' };
  const checkPublic = async photos => {
    const data = strToU8(JSON.stringify({
      format: 'com.piclex.web-deck', schemaVersion: 1, deckID, fingerprint,
      learningFingerprint, title: titled.title, photos, words
    }));
    return parsePublicDeck(data, {
      id: deckID, fingerprint, learningFingerprint, photoCount: 1, count: words.length,
      payloadSHA256: await sha256(data)
    });
  };
  assert.equal((await checkPublic([{ ...publicPhoto, title }])).photos[0].title, title);
  assert.equal((await checkPublic([publicPhoto])).photos[0].title, undefined);
  await assert.rejects(checkPublic([{ ...publicPhoto, title: { text: title } }]));
});
