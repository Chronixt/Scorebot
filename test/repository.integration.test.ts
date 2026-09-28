import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { ScoreRepository } from "../src/db/repository";

const database = (env as typeof env & { SCOREBOT_DB: D1Database }).SCOREBOT_DB;
const repository = new ScoreRepository(database);

beforeEach(async () => {
  await database.batch([
    database.prepare("DELETE FROM answers"),
    database.prepare("DELETE FROM cases"),
    database.prepare("DELETE FROM legacy_score_imports"),
    database.prepare("DELETE FROM players"),
  ]);
});

describe("ScoreRepository", () => {
  it("imports, scores idempotently, and corrects a case", async () => {
    await repository.importLegacyScore(
      { id: "user-1", username: "alice", globalName: "Alice" },
      12,
      "admin-1",
    );

    const input = {
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "message-1",
      pollId: "poll-1",
      question: "Test question",
      correctAnswerId: "answer-a",
      correctAnswerText: "Fact",
      scoredByUserId: "admin-1",
      answers: [
        {
          voteId: "vote-1",
          discordUserId: "user-1",
          username: "alice",
          displayName: "Alice",
          selectedAnswerId: "answer-a",
          selectedAnswerText: "Fact",
          points: 1 as const,
          weight: 1,
          votedAt: "2026-09-28T00:00:00.000Z",
        },
        {
          voteId: "vote-2",
          discordUserId: "user-2",
          username: "bob",
          displayName: "Bob",
          selectedAnswerId: "answer-b",
          selectedAnswerText: "Fictoid",
          points: 0 as const,
          weight: 1,
          votedAt: "2026-09-28T00:01:00.000Z",
        },
      ],
    };

    const first = await repository.scoreCase(input);
    const duplicate = await repository.scoreCase(input);
    expect(first).toEqual({
      caseNumber: 31,
      participants: 2,
      correct: 1,
      alreadyScored: false,
    });
    expect(duplicate).toEqual({ ...first, alreadyScored: true });

    const corrected = await repository.correctCase(31, "answer-b", "Fictoid", "admin-2");
    expect(corrected).toEqual({ caseNumber: 31, participants: 2, correct: 1 });

    expect(await repository.getPlayerStats("user-1")).toMatchObject({
      total_points: 12,
      correct_answers: 0,
      imported_points: 12,
    });
    expect(await repository.getPlayerStats("user-2")).toMatchObject({
      total_points: 1,
      correct_answers: 1,
      imported_points: 0,
    });
    expect((await repository.getLeaderboard()).map((row) => row.discord_user_id)).toEqual([
      "user-1",
      "user-2",
    ]);
  });
});
