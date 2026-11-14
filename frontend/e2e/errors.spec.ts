import { ALICE, expect, gotoApp, login, submitLogin, test } from './fixtures';

function uniqueLogin(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('niepoprawne dane', () => {
  test('waliduje puste i zbyt długie formularze bez zapisu', async ({ page }) => {
    await login(page, ALICE);

    await page.getByRole('button', { name: 'Szyfruj', exact: true }).click();
    await expect(page.getByText('Wpisz treść wiadomości.')).toBeVisible();
    await expect(page.getByLabel('Treść wiadomości')).toBeFocused();

    await page.getByLabel('Treść wiadomości').fill('a'.repeat(10_001));
    await page.getByRole('button', { name: 'Szyfruj', exact: true }).click();
    await expect(page.getByText('Treść może mieć maksymalnie 10 000 znaków.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Wiadomość zapisana' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Odszyfruj', exact: true }).click();
    await expect(page.getByText('Wklej pakiet do odszyfrowania.')).toBeVisible();
    await expect(page.getByLabel('Pakiet do odszyfrowania')).toBeFocused();
  });

  test('wyjaśnia nieprawidłowy format pakietu', async ({ page }) => {
    await login(page, ALICE);

    await page.getByLabel('Pakiet do odszyfrowania').fill('nie-pakiet');
    await page.getByRole('button', { name: 'Odszyfruj', exact: true }).click();

    await expect(
      page.getByText('Pakiet ma nieprawidłowy format. Wklej cały pakiet zaczynający się od v1.'),
    ).toBeVisible();
  });

  test('odrzuca błędne dane logowania bez zdradzania konta', async ({ page }) => {
    await gotoApp(page);
    const username = uniqueLogin('missing');
    await submitLogin(page, { username, password: 'WrongPassword123!' });

    await expect(page.getByRole('alert')).toHaveText('Nieprawidłowy login lub hasło.');
    await expect(page.getByLabel('Login')).toHaveValue(username);
    await expect(page.getByLabel('Hasło')).toHaveValue('');
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
  });

  test('blokuje szóstą próbę logowania i pokazuje Retry-After', async ({ page }) => {
    await gotoApp(page);
    const username = uniqueLogin('limit');
    await page.getByLabel('Login').fill(username);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await page.getByLabel('Hasło').fill('WrongPassword123!');
      await page.getByRole('button', { name: 'Zaloguj się' }).click();
      await expect(page.getByRole('alert')).toHaveText('Nieprawidłowy login lub hasło.');
    }

    await page.getByLabel('Hasło').fill('WrongPassword123!');
    await page.getByRole('button', { name: 'Zaloguj się' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      /Zbyt wiele prób logowania\. Spróbuj ponownie za \d+ s\./,
    );
    await expect(page.getByLabel('Login')).toHaveValue(username);
  });
});

test.describe('utrata sesji', () => {
  test('wraca do logowania z komunikatem po wygaśnięciu sesji', async ({ page }) => {
    await login(page, ALICE);
    await page.context().clearCookies({ name: 'JSESSIONID' });

    await page.getByRole('button', { name: 'Odśwież listę' }).click();

    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
    await expect(page.getByText('Sesja wygasła. Zaloguj się ponownie.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Zapisane wiadomości' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Wyloguj się' })).toHaveCount(0);
  });
});
