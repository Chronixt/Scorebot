import { describe, expect, it } from "vitest";
import { commands } from "../src/discord/commands";

describe("Discord commands", () => {
  it("defines every required command", () => {
    expect(commands.map((command) => command.name)).toEqual([
      "leaderboard",
      "stats",
      "case",
      "importscore",
      "correct",
      "Score Fact or Fictoid",
    ]);
  });

  it("defaults privileged commands to administrators", () => {
    for (const name of ["importscore", "correct", "Score Fact or Fictoid"]) {
      expect(commands.find((command) => command.name === name)).toHaveProperty(
        "default_member_permissions",
        "8",
      );
    }
  });
});
