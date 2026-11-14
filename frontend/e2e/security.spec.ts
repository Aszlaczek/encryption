import {
  ALICE,
  BOB,
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

test.describe('bezpieczeństwo', () => {
  test('renderuje payload XSS jako dosłowny tekst', async ({ page, createdMessages }) => {
    await login(page, ALICE);
    const payload =
      '<img src=x onerror="window.__xssPwned=1"><script>window.__xssPwned2=1</script>';
    const id = await saveMessage(page, createdMessages, payload);
    await refreshList(page);

    const plaintext = await decryptInList(page, id);
    expect(plaintext).toBe(payload);

    const item = messageItem(page, id);
    await expect(item.locator('img')).toHaveCount(0);
    await expect(item.locator('script')).toHaveCount(0);
    await expect(page.locator('img')).toHaveCount(0);

    const executed = await page.evaluate(() => {
      const scope = window as unknown as { __xssPwned?: number; __xssPwned2?: number };
      return { img: scope.__xssPwned, script: scope.__xssPwned2 };
    });
    expect(executed).toEqual({ img: undefined, script: undefined });
  });

  test('przełączenie z alice na bob czyści dane poprzedniego konta', async ({
    page,
    createdMessages,
  }) => {
    await login(page, ALICE);
    const marker = uniqueMarker('switch');
    const id = await saveMessage(page, createdMessages, marker);
    await refreshList(page);
    const alicePackage = await readPackage(page, id);

    await logout(page);
    await login(page, BOB);

    await expect(page.getByText('Jesteś zalogowany jako')).toContainText('bob');
    await expect(messageItem(page, id)).toHaveCount(0);
    await expect(page.getByText(marker)).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Odszyfrowana treść' })).toHaveCount(0);

    await page.getByLabel('Pakiet do odszyfrowania').fill(alicePackage);
    await page.getByRole('button', { name: 'Odszyfruj', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Nie udało się odszyfrować pakietu. Sprawdź, czy pochodzi z tego konta i nie został zmieniony.',
    );

    const storage = await page.evaluate(async () => {
      const databases = indexedDB.databases ? (await indexedDB.databases()).length : 0;
      return {
        local: localStorage.length,
        session: sessionStorage.length,
        databases,
      };
    });
    expect(storage).toEqual({ local: 0, session: 0, databases: 0 });
  });
});
