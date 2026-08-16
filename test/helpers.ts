import { loadConfig, type Config } from "../src/config";
import { createLogger, type Logger } from "../src/logger";

export const TEST_APP_SECRET = "test-app-secret";
export const TEST_VERIFY_TOKEN = "test-verify-token";

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    WHATSAPP_TOKEN: "test-wa-token",
    PHONE_NUMBER_ID: "123456789",
    VERIFY_TOKEN: TEST_VERIFY_TOKEN,
    APP_SECRET: TEST_APP_SECRET,
    ANTHROPIC_API_KEY: "sk-ant-test",
    ADMIN_TG_CHAT_ID: "42",
    ...overrides,
  } as NodeJS.ProcessEnv);
}

export function silentLogger(): Logger {
  return createLogger("silent");
}
