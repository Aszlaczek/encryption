import { request } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/** Fails before the first scenario when the Compose stack is not reachable through nginx. */
export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({ baseURL });
  try {
    const response = await api.get('/actuator/health', { timeout: 5_000 });
    if (!response.ok()) {
      throw new Error(`HTTP ${response.status()}`);
    }
    const body = (await response.json()) as { status?: string };
    if (body.status !== 'UP') {
      throw new Error(`status ${String(body.status)}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `E2E wymagają działającego stosu pod ${baseURL}. Uruchom "docker compose up -d" ` +
        `i sprawdź "${baseURL}/actuator/health". Przyczyna: ${reason}`,
      { cause: error },
    );
  } finally {
    await api.dispose();
  }
}
