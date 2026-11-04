#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');

const docs = read('docs/API.md');
const readme = read('README.md');
const dataModel = read('docs/DATA_MODEL.md');
const files = [
  ['docs/API.md', docs],
  ['README.md', readme],
  ['docs/DATA_MODEL.md', dataModel],
];

const errors = [];
const ok = (message) => console.log(`  OK  ${message}`);
const fail = (message) => {
  errors.push(message);
  console.log(`  BŁĄD ${message}`);
};

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function section(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return '';
  const end = text.indexOf(endMarker, start + startMarker.length);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      visit(key, child);
      walk(child, visit);
    }
  }
}

// 1. JSON examples
console.log('1. Bloki JSON');
const jsonBlocks = [];
const jsonPattern = /```json\r?\n([\s\S]*?)```/g;
let match;
while ((match = jsonPattern.exec(docs)) !== null) {
  const line = lineOf(docs, match.index);
  try {
    jsonBlocks.push({ value: JSON.parse(match[1]), line });
  } catch (error) {
    fail(`niepoprawny JSON w docs/API.md, linia ${line}: ${error.message}`);
  }
}
if (jsonBlocks.length === 0) {
  fail('brak bloków JSON w docs/API.md');
} else {
  ok(`${jsonBlocks.length} bloków JSON parsuje się poprawnie`);
}

// 2. Packages
console.log('2. Pakiety');
const packages = [];
for (const block of jsonBlocks) {
  walk(block.value, (key, value) => {
    if (key === 'package' && typeof value === 'string') {
      packages.push({ value, line: block.line });
    }
  });
}

const b64url = /^[A-Za-z0-9_-]+$/;
const keyIdPattern = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function canonicalBase64Url(value) {
  if (!b64url.test(value)) return false;
  return Buffer.from(value, 'base64url').toString('base64url') === value;
}

function inspectPackage(value) {
  const problems = [];
  if (value.length > 56000) problems.push('długość > 56 000');
  if (!/^[\x20-\x7E]+$/.test(value)) problems.push('znaki spoza ASCII');
  const segments = value.split('.');
  if (segments.length !== 5) {
    problems.push(`oczekiwano 5 segmentów, jest ${segments.length}`);
    return problems;
  }
  const [version, keyId, nonce, ciphertext, tag] = segments;
  if (version !== 'v1') problems.push('wersja inna niż v1');
  if (!keyIdPattern.test(keyId)) problems.push('niepoprawny keyId');
  for (const [name, segment] of [['nonce', nonce], ['ciphertext', ciphertext], ['tag', tag]]) {
    if (!canonicalBase64Url(segment)) problems.push(`${name} nie jest kanonicznym base64url`);
  }
  if (!problems.some((problem) => problem.startsWith('nonce'))) {
    if (Buffer.from(nonce, 'base64url').length !== 12) problems.push('nonce ma inną długość niż 12 B');
  }
  if (!problems.some((problem) => problem.startsWith('ciphertext'))) {
    const length = Buffer.from(ciphertext, 'base64url').length;
    if (length < 1 || length > 40000) problems.push(`ciphertext ma ${length} B`);
  }
  if (!problems.some((problem) => problem.startsWith('tag'))) {
    if (Buffer.from(tag, 'base64url').length !== 16) problems.push('tag ma inną długość niż 16 B');
  }
  return problems;
}

if (packages.length === 0) {
  fail('brak przykładów pakietu');
} else {
  for (const item of packages) {
    const problems = inspectPackage(item.value);
    if (problems.length > 0) {
      fail(`pakiet z linii ${item.line}: ${problems.join('; ')}`);
    }
  }
  ok(`${packages.length} wystąpień pakietu ma poprawną strukturę`);
}

// 3. AES-GCM test vector
console.log('3. Wektor AES-256-GCM');
const vector = jsonBlocks
  .map((block) => block.value)
  .find((value) => value && typeof value === 'object' && 'keyBase64' in value);

if (!vector) {
  fail('brak wektora testowego (keyBase64)');
} else {
  const key = Buffer.from(vector.keyBase64, 'base64');
  const nonce = Buffer.from(vector.nonceBase64Url, 'base64url');
  const packageSegments = String(vector.package).split('.');
  const packageNonce = packageSegments[2];
  const ciphertext = Buffer.from(packageSegments[3], 'base64url');
  const tag = Buffer.from(packageSegments[4], 'base64url');
  const aad = `v1:${vector.ownerId}:${vector.keyId}`;

  if (key.length !== 32) fail(`klucz ma ${key.length} B zamiast 32`);
  if (nonce.length !== 12) fail(`nonce wektora ma ${nonce.length} B zamiast 12`);
  if (packageNonce !== vector.nonceBase64Url) fail('nonce w pakiecie różni się od nonceBase64Url');
  if (vector.aad !== aad) fail('pole aad nie odpowiada formatowi v1:<ownerId>:<keyId>');
  if (packageSegments[1] !== vector.keyId) fail('keyId w pakiecie różni się od keyId wektora');

  const plaintextBytes = Buffer.byteLength(vector.plaintext, 'utf8');
  const plaintextCodePoints = [...vector.plaintext].length;
  if (plaintextBytes < 1 || plaintextBytes > 40000) {
    fail(`plaintext wektora ma ${plaintextBytes} B zamiast 1–40 000`);
  }
  if (plaintextCodePoints > 10000) {
    fail(`plaintext wektora ma ${plaintextCodePoints} punktów kodowych zamiast maks. 10 000`);
  }

  let decrypted = null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (error) {
    fail(`nie udało się odszyfrować wektora: ${error.message}`);
  }
  if (decrypted !== null && decrypted !== vector.plaintext) {
    fail('odszyfrowany tekst różni się od plaintext');
  }

  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const repeated = Buffer.concat([cipher.update(vector.plaintext, 'utf8'), cipher.final()]);
    const repeatedTag = cipher.getAuthTag();
    if (!repeated.equals(ciphertext)) fail('ponowne szyfrowanie dało inny ciphertext');
    if (!repeatedTag.equals(tag)) fail('ponowne szyfrowanie dało inny tag');
  } catch (error) {
    fail(`nie udało się ponownie zaszyfrować wektora: ${error.message}`);
  }

  const wrongAad = `v1:2c9b7a61-3d4e-4f50-8a6b-1c2d3e4f5a6b:${vector.keyId}`;
  let rejected = false;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(wrongAad, 'utf8'));
    decipher.setAuthTag(tag);
    Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    rejected = true;
  }
  if (!rejected) fail('AAD innego właściciela nie został odrzucony');

  if (errors.length === 0) {
    ok('odszyfrowanie, ponowne szyfrowanie i odrzucenie obcego AAD są zgodne');
  }
}

// 4. Endpoints
console.log('4. Endpointy');
const expectedEndpoints = [
  ['GET', '/api/auth/csrf'],
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/logout'],
  ['GET', '/api/auth/me'],
  ['POST', '/api/crypto/encrypt'],
  ['POST', '/api/crypto/decrypt'],
  ['POST', '/api/messages'],
  ['GET', '/api/messages'],
  ['GET', '/api/messages/{id}'],
  ['POST', '/api/messages/{id}/decrypt'],
  ['DELETE', '/api/messages/{id}'],
  ['GET', '/actuator/health'],
];
const endpointSection = section(docs, '## 3. Endpointy', '## 4.');
const documentedEndpoints = [];
const endpointPattern = /^\|\s*`(GET|POST|DELETE)`\s*\|\s*`([^`]+)`\s*\|/gm;
while ((match = endpointPattern.exec(endpointSection)) !== null) {
  documentedEndpoints.push([match[1], match[2]]);
}
for (const [method, path] of expectedEndpoints) {
  const found = documentedEndpoints.some(([m, p]) => m === method && p === path);
  if (!found) fail(`brak w tabeli: ${method} ${path}`);
}
if (documentedEndpoints.length !== expectedEndpoints.length) {
  fail(`tabela endpointów ma ${documentedEndpoints.length} wierszy zamiast ${expectedEndpoints.length}`);
}
if (errors.length === 0) ok(`${documentedEndpoints.length} endpointów w tabeli`);

// 5. Error codes
console.log('5. Kody błędów');
const mainCodesSection = section(docs, '### 7.2', '### 7.3');
const fieldCodesSection = section(docs, '### 7.3', '### 7.4');
const mainCodes = new Set();
const fieldCodes = new Set();
const mainPattern = /^\|\s*`(\d{3})`\s*\|\s*`([A-Z_]+)`\s*\|/gm;
const fieldPattern = /^\|\s*`([A-Z_]+)`\s*\|/gm;
while ((match = mainPattern.exec(mainCodesSection)) !== null) mainCodes.add(match[2]);
while ((match = fieldPattern.exec(fieldCodesSection)) !== null) fieldCodes.add(match[1]);

if (mainCodes.size < 19) fail(`tabela głównych kodów ma ${mainCodes.size} pozycji`);
if (fieldCodes.size < 8) fail(`tabela kodów pól ma ${fieldCodes.size} pozycji`);

const usedCodes = new Set();
for (const block of jsonBlocks) {
  walk(block.value, (key, value) => {
    if (key === 'code' && typeof value === 'string') usedCodes.add(value);
  });
}
const documented = new Set([...mainCodes, ...fieldCodes]);
for (const code of usedCodes) {
  if (!documented.has(code)) fail(`kod ${code} użyty w przykładzie nie jest opisany w tabelach`);
}
if (errors.length === 0) {
  ok(`${mainCodes.size} kodów głównych i ${fieldCodes.size} kodów pól; wszystkie użyte kody są opisane`);
}

// 6. Owner field
console.log('6. Właściciel z sesji');
const forbiddenOwnerKeys = new Set(['ownerId', 'owner_id', 'userId']);
for (const block of jsonBlocks) {
  // Wektor testowy celowo zawiera ownerId jako parametr kryptograficzny.
  if (block.value && typeof block.value === 'object' && 'keyBase64' in block.value) continue;
  walk(block.value, (key) => {
    if (forbiddenOwnerKeys.has(key)) {
      fail(`pole "${key}" występuje jako klucz JSON w przykładzie żądania/odpowiedzi, linia ${block.line}`);
    }
  });
}
if (!docs.includes('Właściciel pochodzi wyłącznie z sesji')) {
  fail('brak jawnej reguły właściciela z sesji');
}
if (errors.length === 0) ok('brak pól właściciela w DTO i jawna reguła sesyjna');

// 7. Cross-file invariants
console.log('7. Spójność dokumentów');
const invariants = [
  'v1.<key_id>.<base64url(nonce)>.<base64url(ciphertext)>.<base64url(tag)>',
  'v1:<ownerId>:<keyId>',
  '56 000',
  '40 000',
  '10 000',
  '65 536',
];
for (const invariant of invariants) {
  for (const [name, content] of files) {
    if (!content.includes(invariant)) fail(`${name}: brak "${invariant}"`);
  }
}
if (errors.length === 0) ok('format pakietu, AAD i limity są spójne w trzech dokumentach');

// 8. Cursors
console.log('8. Kursory');
const pages = jsonBlocks
  .map((block) => block.value)
  .filter((value) => value && Array.isArray(value.items) && 'nextCursor' in value);
const cursorErrorsBefore = errors.length;
for (const page of pages) {
  const last = page.items[page.items.length - 1];
  if (page.hasMore === true) {
    if (typeof page.nextCursor !== 'string') {
      fail('hasMore=true, ale nextCursor nie jest stringiem');
      continue;
    }
    if (!canonicalBase64Url(page.nextCursor)) fail('nextCursor nie jest kanonicznym base64url');
    if (page.nextCursor.length > 512) fail('nextCursor przekracza 512 znaków');
    const decoded = Buffer.from(page.nextCursor, 'base64url').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator === -1) {
      fail('nextCursor nie zawiera separatora ":"');
      continue;
    }
    const micros = Number(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (!Number.isSafeInteger(micros) || micros <= 0) fail('nextCursor ma niepoprawne epochMicros');
    if (!last) {
      fail('hasMore=true, ale lista jest pusta');
      continue;
    }
    if (micros !== Date.parse(last.createdAt) * 1000) {
      fail('nextCursor nie wskazuje na createdAt ostatniego elementu');
    }
    if (id !== last.id) fail('nextCursor nie wskazuje na id ostatniego elementu');
  } else if (page.nextCursor !== null) {
    fail('hasMore=false, ale nextCursor nie jest null');
  }
}
if (pages.length === 0) {
  fail('brak przykładu paginacji');
} else if (errors.length === cursorErrorsBefore) {
  ok(`${pages.length} przykład paginacji wskazuje ostatni element strony`);
}

// Summary
console.log('');
if (errors.length > 0) {
  console.error(`Walidacja nie powiodła się: ${errors.length} błędów.`);
  process.exit(1);
}

console.log(
  `OK: ${jsonBlocks.length} przykładów JSON, ${documentedEndpoints.length} endpointów, ` +
    `${mainCodes.size} kodów głównych, ${fieldCodes.size} kodów pól, ` +
    `${packages.length} pakietów, ${pages.length} przykład paginacji, wektor AES-256-GCM zgodny.`,
);
