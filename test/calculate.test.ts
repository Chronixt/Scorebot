import { describe, expect, it } from "vitest";
import { calculateScores } from "../src/scoring/calculate";
import type { EasyPollAnswer, EasyPollVote } from "../src/easypoll/types";

const answers: EasyPollAnswer[] = [
  { id: "answer-a", name: "Fact", position: 0 },
  { id: "answer-b", name: "Fictoid", position: 1 },
];

const votes: EasyPollVote[] = [
  {
    id: "vote-1",
    pollId: "poll-1",
    answerId: "answer-a",
    weight: 1,
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
    user: { id: "user-1", username: "alice", globalName: "Alice" },
  },
  {
    id: "vote-2",
    pollId: "poll-1",
    answerId: "answer-b",
    weight: 3,
    createdAt: "2026-09-28T00:01:00.000Z",
    updatedAt: "2026-09-28T00:01:00.000Z",
    user: { id: "user-2", username: "bob", globalName: null },
  },
];

describe("calculateScores", () => {
  it("awards one point to users who selected the correct answer", () => {
    const result = calculateScores(answers, votes, "answer-a");

    expect(result.map(({ discordUserId, points }) => ({ discordUserId, points }))).toEqual([
      { discordUserId: "user-1", points: 1 },
      { discordUserId: "user-2", points: 0 },
    ]);
  });

  it("does not use EasyPoll vote weights as score multipliers", () => {
    const result = calculateScores(answers, votes, "answer-b");
    expect(result[1]?.weight).toBe(3);
    expect(result[1]?.points).toBe(1);
  });

  it("rejects a correct answer from another poll", () => {
    expect(() => calculateScores(answers, votes, "missing")).toThrow(
      "The correct answer does not belong to this poll.",
    );
  });

  it("rejects multiple selections by the same user", () => {
    const duplicateUserVotes = [
      votes[0]!,
      { ...votes[1]!, user: votes[0]!.user },
    ];

    expect(() => calculateScores(answers, duplicateUserVotes, "answer-a")).toThrow(
      "scoring requires a single-choice poll",
    );
  });
});
