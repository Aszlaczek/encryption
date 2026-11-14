import { expect, request, test as base, type APIRequestContext, type Page } from '@playwright/test';

export const ALICE = { username: 'alice', password: 'AliceDemo123!' } as const;
export const BOB = { username: 'bob', password: 'BobDemo1234!' } as const;

export type Account = { username: string; password: string };

/**
 * Scenario fixture. Every message saved by a test is registered here and removed through the
 * public API in teardown, so repeated local runs do not pile up rows in the demo database.
 */
export const test = base.extend<{ createdMessages: string[] }>({
  createdMessages: async ({}, use) => {
    const ids: string[] = [];
    await use(ids);
    await purgeMessages(ids);
  },
});

export { expect };

export function uniqueMarker(label: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `E2E ${label} ${suffix}`;
}

export async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
}

export async function submitLogin(page: Page, account: Account): Promise<void> {
  await page.getByLabel('Login').fill(account.username);
  await page.getByLabel('Hasło').fill(account.password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

export async function login(page: Page, account: Account = ALICE): Promise<void> {
  await gotoApp(page);
  await submitLogin(page, account);
  await expect(page.getByRole('heading', { name: 'Zalogowano' })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Wyloguj się' }).click();
  await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
}

export async function saveMessage(
  page: Page,
  createdMessages: string[],
  plaintext: string,
): Promise<string> {
  await page.getByLabel('Treść wiadomości').fill(plaintext);
  await page.getByRole('button', { name: 'Szyfruj i zapisz' }).click();
  const saved = page.getByRole('region', { name: 'Wiadomość zapisana' });
  await expect(saved).toBeVisible();
  const id = (await saved.locator('code').first().innerText()).trim();
  createdMessages.push(id);
  return id;
}

export function messageItem(page: Page, id: string) {
  return page.locator(`li[data-message-id="${id}"]`);
}

/** The list is refreshed explicitly: saving through the crypto panel does not reload it. */
export async function refreshList(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Odśwież listę' }).click();
}

export async function readPackage(page: Page, id: string): Promise<string> {
  const item = messageItem(page, id);
  await item.getByRole('button', { name: /^Pokaż pakiet/ }).click();
  const value = item.getByRole('group', { name: 'Pakiet wiadomości' });
  await expect(value).toContainText('v1.');
  return (await value.innerText()).trim();
}

export async function decryptInList(page: Page, id: string): Promise<string> {
  const item = messageItem(page, id);
  await item.getByRole('button', { name: /^Odszyfruj wiadomość/ }).click();
  const value = item.getByRole('group', { name: 'Odszyfrowana treść' });
  await expect(value).toBeVisible();
  return (await value.innerText()).trim();
}

async function csrfToken(api: APIRequestContext): Promise<string> {
  const state = await api.storageState();
  const cookie = state.cookies.find((entry) => entry.name === 'XSRF-TOKEN');
  if (!cookie) {
    throw new Error('Brak cookie XSRF-TOKEN w kontekście sprzątającym.');
  }
  return decodeURIComponent(cookie.value);
}

async function purgeMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const api = await request.newContext({ baseURL });
  try {
    await api.get('/api/auth/csrf');
    const loginResponse = await api.post('/api/auth/login', {
      data: { username: ALICE.username, password: ALICE.password },
      headers: { 'X-XSRF-TOKEN': await csrfToken(api) },
    });
    if (!loginResponse.ok()) {
      throw new Error(`Logowanie sprzątające zwróciło HTTP ${loginResponse.status()}.`);
    }

    const token = await csrfToken(api);
    for (const id of ids) {
      const response = await api.delete(`/api/messages/${id}`, {
        headers: { 'X-XSRF-TOKEN': token },
      });
      if (!response.ok() && response.status() !== 404) {
        throw new Error(`Sprzątanie wiadomości ${id} zwróciło HTTP ${response.status()}.`);
      }
    }
  } finally {
    await api.dispose();
  }
}
