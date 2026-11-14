#!/usr/bin/env node
// ZR-23: HTTP benchmark for the message list and decrypt endpoints.
// Runs against the real Compose stack through nginx (default http://localhost:3000).
//
//   node scripts/perf/benchmark.mjs cursor --offset 49890
//   node scripts/perf/benchmark.mjs list --limit 10 --requests 2000 --concurrency 10
//   node scripts/perf/benchmark.mjs list --limit 50 --requests 2000 --concurrency 1
//   node scripts/perf/benchmark.mjs list --limit 10 --requests 1000 --cursor <value>
//   node scripts/perf/benchmark.mjs seed-crypto --requests 200
//   node scripts/perf/benchmark.mjs detail --requests 200 --concurrency 5
//   node scripts/perf/benchmark.mjs decrypt --requests 200 --concurrency 5
//
// Credentials come from PERF_USERNAME / PERF_PASSWORD / PERF_BASE_URL.
// Scripts are development tooling and are not part of npm test or the Playwright suite.

import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.PERF_BASE_URL ?? 'http://localhost:3000';
const USERNAME = process.env.PERF_USERNAME ?? 'perf_heavy';
const PASSWORD = process.env.PERF_PASSWORD ?? 'AliceDemo123!';
const CRYPTO_USERNAME = process.env.PERF_CRYPTO_USERNAME ?? 'perf_crypto';

function parseArgs(argv) {
    const [mode = 'list', ...rest] = argv;
    const options = {};
    for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i];
        if (!arg.startsWith('--')) {
            throw new Error(`Nieoczekiwany argument: ${arg}`);
        }
        const key = arg.slice(2);
        const next = rest[i + 1];
        if (next === undefined || next.startsWith('--')) {
            options[key] = true;
        } else {
            options[key] = next;
            i += 1;
        }
    }
    return { mode, options };
}

function intOption(value, fallback, name) {
    if (value === undefined) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${name} musi być nieujemną liczbą całkowitą`);
    }
    return parsed;
}

class Session {
    cookies = new Map();

    absorb(response) {
        const headers = response.headers.getSetCookie?.() ?? [];
        for (const raw of headers) {
            const pair = raw.split(';', 1)[0];
            const separator = pair.indexOf('=');
            if (separator < 0) {
                continue;
            }
            const name = pair.slice(0, separator).trim();
            const value = pair.slice(separator + 1).trim();
            const lowered = raw.toLowerCase();
            if (value === '' || lowered.includes('max-age=0')) {
                this.cookies.delete(name);
            } else {
                this.cookies.set(name, value);
            }
        }
    }

    header() {
        return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    csrfToken() {
        return this.cookies.get('XSRF-TOKEN');
    }
}

function url(path) {
    return new URL(path, BASE_URL).toString();
}

async function request(session, path, init = {}) {
    const headers = { ...(init.headers ?? {}) };
    const cookie = session.header();
    if (cookie) {
        headers.cookie = cookie;
    }
    const response = await fetch(url(path), { ...init, headers, redirect: 'manual' });
    session.absorb(response);
    return response;
}

async function refreshCsrf(session) {
    const response = await request(session, '/api/auth/csrf');
    await response.arrayBuffer();
    if (!response.ok) {
        throw new Error(`CSRF ${response.status}`);
    }
    const token = session.csrfToken();
    if (!token) {
        throw new Error('Brak cookie XSRF-TOKEN');
    }
    return token;
}

async function login(username, password) {
    const session = new Session();
    const csrf = await refreshCsrf(session);
    const response = await request(session, '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-xsrf-token': csrf },
        body: JSON.stringify({ username, password }),
    });
    const body = await response.text();
    if (!response.ok) {
        throw new Error(`Logowanie ${username}: ${response.status} ${body}`);
    }
    // Login rotates both the session and the CSRF token.
    await refreshCsrf(session);
    return session;
}

async function collectIds(session, count) {
    const ids = [];
    let cursor = null;
    while (ids.length < count) {
        const query = new URLSearchParams({ limit: '50' });
        if (cursor) {
            query.set('cursor', cursor);
        }
        const response = await request(session, `/api/messages?${query}`);
        if (!response.ok) {
            throw new Error(`Lista: ${response.status}`);
        }
        const page = await response.json();
        ids.push(...page.items.map((item) => item.id));
        if (!page.hasMore || !page.nextCursor) {
            break;
        }
        cursor = page.nextCursor;
    }
    return ids;
}

function percentile(sorted, p) {
    if (sorted.length === 0) {
        return 0;
    }
    const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[index];
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}

async function benchmark({ label, requests, concurrency, warmup, makeRequest, expectStatus = 200 }) {
    for (let i = 0; i < warmup; i += 1) {
        await makeRequest(i);
    }

    const durations = [];
    const statuses = new Map();
    let counter = 0;
    let failures = 0;
    const started = performance.now();

    async function worker() {
        while (true) {
            const index = counter;
            counter += 1;
            if (index >= requests) {
                return;
            }
            const begin = performance.now();
            try {
                const response = await makeRequest(index);
                await response.arrayBuffer();
                durations.push(performance.now() - begin);
                statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
                if (response.status !== expectStatus) {
                    failures += 1;
                }
            } catch (error) {
                durations.push(performance.now() - begin);
                failures += 1;
                console.error(`Błąd żądania ${index}:`, error);
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    const wallSeconds = (performance.now() - started) / 1000;
    const sorted = [...durations].sort((left, right) => left - right);
    const total = sorted.reduce((sum, value) => sum + value, 0);
    return {
        label,
        requests,
        concurrency,
        wallSeconds: round(wallSeconds),
        requestsPerSecond: round(requests / wallSeconds),
        meanMs: round(total / Math.max(sorted.length, 1)),
        p50Ms: round(percentile(sorted, 50)),
        p90Ms: round(percentile(sorted, 90)),
        p95Ms: round(percentile(sorted, 95)),
        p99Ms: round(percentile(sorted, 99)),
        minMs: round(sorted[0] ?? 0),
        maxMs: round(sorted[sorted.length - 1] ?? 0),
        statuses: Object.fromEntries(statuses),
        failures,
    };
}

function printResult(result) {
    const statuses = Object.entries(result.statuses)
        .map(([status, count]) => `${status}:${count}`)
        .join(' ');
    console.log(
        [
            `tryb=${result.label}`,
            `requests=${result.requests}`,
            `concurrency=${result.concurrency}`,
            `rps=${result.requestsPerSecond}`,
            `p50=${result.p50Ms}ms`,
            `p90=${result.p90Ms}ms`,
            `p95=${result.p95Ms}ms`,
            `p99=${result.p99Ms}ms`,
            `max=${result.maxMs}ms`,
            `mean=${result.meanMs}ms`,
            `statusy=[${statuses}]`,
            `błędy=${result.failures}`,
        ].join(' '),
    );
}

function encodeCursor(micros, id) {
    return Buffer.from(`${micros}:${id}`, 'ascii').toString('base64url');
}

function cursorFromDatabase(owner, offset) {
    if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(owner)) {
        throw new Error('Nieprawidłowa nazwa użytkownika');
    }
    if (!Number.isInteger(offset) || offset < 0) {
        throw new Error('offset musi być nieujemną liczbą całkowitą');
    }
    const sql = `
        select (extract(epoch from m.created_at) * 1000000)::bigint, m.id
        from messages m
        join app_users u on u.id = m.owner_id
        where u.username = '${owner}'
        order by m.created_at desc, m.id desc
        offset ${offset}
        limit 1`;
    const output = execFileSync(
        'docker',
        ['compose', 'exec', '-T', 'db', 'psql', '-tAc', sql, '-U', 'encryption', '-d', 'encryption'],
        { encoding: 'utf8', cwd: process.cwd() },
    ).trim();
    const [micros, id] = output.split('|');
    if (!micros || !id) {
        throw new Error(`Brak wiersza na offset ${offset}`);
    }
    return encodeCursor(micros, id);
}

async function main() {
    const { mode, options } = parseArgs(process.argv.slice(2));
    const requests = intOption(options.requests, 2000, 'requests');
    const concurrency = Math.max(1, intOption(options.concurrency, 10, 'concurrency'));
    const warmup = intOption(options.warmup, Math.min(200, requests), 'warmup');
    const limit = intOption(options.limit, 10, 'limit');

    if (mode === 'cursor') {
        const cursor = cursorFromDatabase(
            options.username ?? USERNAME,
            intOption(options.offset, 0, 'offset'),
        );
        console.log(cursor);
        return;
    }

    if (mode === 'seed-crypto') {
        const session = await login(CRYPTO_USERNAME, PASSWORD);
        const total = requests;
        const sizes = [128, 512, 4096, 8000];
        const ids = [];
        for (let i = 0; i < total; i += 1) {
            const size = sizes[i % sizes.length];
            const response = await request(session, '/api/messages', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-xsrf-token': session.csrfToken(),
                },
                body: JSON.stringify({ plaintext: 'x'.repeat(size) }),
            });
            if (response.status !== 201) {
                throw new Error(`Tworzenie wiadomości ${i}: ${response.status} ${await response.text()}`);
            }
            ids.push((await response.json()).id);
        }
        console.log(`utworzono=${ids.length} użytkownik=${CRYPTO_USERNAME} rozmiary=${sizes.join('/')}`);
        return;
    }

    const session = await login(USERNAME, PASSWORD);

    if (mode === 'list') {
        const cursor = options.cursor === true || options.cursor === undefined ? null : options.cursor;
        const path = (pageSize) => {
            const query = new URLSearchParams({ limit: String(pageSize) });
            if (cursor) {
                query.set('cursor', cursor);
            }
            return `/api/messages?${query}`;
        };
        const result = await benchmark({
            label: `list limit=${limit}${cursor ? ' cursor' : ''}`,
            requests,
            concurrency,
            warmup,
            makeRequest: () => request(session, path(limit)),
        });
        printResult(result);
        if (options.json) {
            console.log(JSON.stringify(result));
        }
        return;
    }

    if (mode === 'detail' || mode === 'decrypt') {
        // Decrypt needs messages with a valid GCM tag, so it uses the API-created fixture
        // account instead of the synthetic list dataset.
        const fixtureSession =
            mode === 'decrypt' ? await login(CRYPTO_USERNAME, PASSWORD) : session;
        const ids = await collectIds(fixtureSession, requests);
        if (ids.length === 0) {
            throw new Error('Brak wiadomości do pomiaru');
        }
        const result = await benchmark({
            label: mode === 'detail' ? 'detail' : 'decrypt',
            requests,
            concurrency,
            warmup,
            expectStatus: 200,
            makeRequest: (index) => {
                const id = ids[index % ids.length];
                if (mode === 'detail') {
                    return request(fixtureSession, `/api/messages/${id}`);
                }
                return request(fixtureSession, `/api/messages/${id}/decrypt`, {
                    method: 'POST',
                    headers: { 'x-xsrf-token': fixtureSession.csrfToken() },
                });
            },
        });
        printResult(result);
        if (options.json) {
            console.log(JSON.stringify(result));
        }
        return;
    }

    throw new Error(`Nieznany tryb: ${mode}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
