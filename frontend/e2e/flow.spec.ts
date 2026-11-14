import {
  ALICE,
  decryptInList,
  expect,
  login,
  logout,
  messageItem,
  readPackage,
  refreshList,
  saveMessage,
  test,
  uniqueMarker,
} from './fixtures';

test.describe('pełny przepływ', () => {
  test('logowanie–szyfrowanie–zapis–odczyt–wylogowanie', async ({ page, createdMessages }) => {
    await login(page, ALICE);
    const marker = uniqueMarker('flow');

    await page.getByLabel('Treść wiadomości').fill(marker);
    await page.getByRole('button', { name: 'Szyfruj', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Pakiet zaszyfrowany' })).toContainText('v1.');

    const id = await saveMessage(page, createdMessages, marker);
    await refreshList(page);
    await expect(messageItem(page, id)).toBeVisible();

    const packageValue = await readPackage(page, id);
    expect(packageValue).toMatch(/^v1\.[^.]+\.[^.]+\.[^.]+\.[^.]+$/);

    await page.getByLabel('Pakiet do odszyfrowania').fill(packageValue);
    await page.getByRole('button', { name: 'Odszyfruj', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Deszyfrowanie' }).getByRole('group', {
        name: 'Odszyfrowana treść',
      }),
    ).toHaveText(marker);

    expect(await decryptInList(page, id)).toBe(marker);

    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === 'JSESSIONID');
    expect(session).toBeDefined();
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    expect(session?.secure).toBe(false);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Zalogowano' })).toBeVisible();
    await expect(messageItem(page, id)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Odszyfrowana treść' })).toHaveCount(0);

    await logout(page);
    await expect(page.locator('li[data-message-id]')).toHaveCount(0);
    const afterLogout = await page.context().cookies();
    expect(afterLogout.find((cookie) => cookie.name === 'JSESSIONID')).toBeUndefined();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
  });
});
