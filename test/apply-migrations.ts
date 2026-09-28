import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";

const testEnv = env as typeof env & {
  SCOREBOT_DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

await applyD1Migrations(testEnv.SCOREBOT_DB, testEnv.TEST_MIGRATIONS);
