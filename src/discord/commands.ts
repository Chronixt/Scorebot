const CHAT_INPUT = 1;
const USER = 6;
const INTEGER = 4;
const STRING = 3;
const MESSAGE = 3;
const ADMINISTRATOR = "8";

export const commands = [
  {
    name: "leaderboard",
    description: "Show the all-time Fact or Fictoid rankings",
    type: CHAT_INPUT,
  },
  {
    name: "stats",
    description: "Show Fact or Fictoid statistics for a player",
    type: CHAT_INPUT,
    options: [
      {
        name: "user",
        description: "Player to show; defaults to you",
        type: USER,
        required: false,
      },
    ],
  },
  {
    name: "case",
    description: "Show the results for a Fact or Fictoid case",
    type: CHAT_INPUT,
    options: [
      {
        name: "number",
        description: "Case number",
        type: INTEGER,
        required: true,
        min_value: 1,
      },
    ],
  },
  {
    name: "importscore",
    description: "Import a player's score from Cases 1-30",
    type: CHAT_INPUT,
    default_member_permissions: ADMINISTRATOR,
    options: [
      {
        name: "user",
        description: "Player whose score will be imported",
        type: USER,
        required: true,
      },
      {
        name: "points",
        description: "Total points earned across Cases 1-30",
        type: INTEGER,
        required: true,
        min_value: 0,
      },
    ],
  },
  {
    name: "correct",
    description: "Correct and recalculate a previously scored case",
    type: CHAT_INPUT,
    default_member_permissions: ADMINISTRATOR,
    options: [
      {
        name: "case",
        description: "Case number to correct",
        type: INTEGER,
        required: true,
        min_value: 1,
      },
      {
        name: "answer",
        description: "Correct answer number, exact text, or EasyPoll answer ID",
        type: STRING,
        required: true,
      },
    ],
  },
  {
    name: "Score Fact or Fictoid",
    type: MESSAGE,
    default_member_permissions: ADMINISTRATOR,
  },
] as const;
