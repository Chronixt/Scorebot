import { InteractionResponseType } from "discord-interactions";
import { ScoreRepository } from "../db/repository";
import { EasyPollClient } from "../easypoll/client";
import { calculateScores } from "../scoring/calculate";
import type { Env } from "../env";
import { errorFields, logEvent } from "../logging";

const DISCORD_API = "https://discord.com/api/v10";
const EPHEMERAL = 64;
const ADMINISTRATOR = 8n;
const SCORE_PREFIX = "score-poll:";

interface ScoringInteraction {
  application_id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  data: {
    target_id?: string;
    custom_id?: string;
    values?: string[];
    options?: Array<{ name: string; value: string | number }>;
  };
  member?: {
    permissions: string;
    user: { id: string };
  };
}

export function deferEphemeral(): Response {
  return Response.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: EPHEMERAL },
  });
}

export async function prepareScoreSelection(
  interaction: ScoringInteraction,
  env: Env,
): Promise<void> {
  try {
    requireAdministrator(interaction);
    const guildId = required(interaction.guild_id, "guild ID");
    const messageId = required(interaction.data.target_id, "target message ID");
    const client = new EasyPollClient(env.EASYPOLL_API_KEY);
    const poll = await client.findPollByMessageId(guildId, messageId);

    if (!poll) throw new Error("That message is not an EasyPoll poll visible to this API key.");
    if (poll.failed) throw new Error("EasyPoll reports that this poll failed.");
    if (!poll.closedAt) throw new Error("Close the EasyPoll poll before scoring it.");

    const answers = await client.getAnswers(poll.id);
    if (answers.length < 2) throw new Error("This poll does not have enough answers to score.");
    if (answers.length > 25) throw new Error("Discord selectors support at most 25 answers.");

    await editOriginal(interaction, {
      content: `Choose the correct answer for **${poll.question}**.`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: `${SCORE_PREFIX}${poll.id}`,
              placeholder: "Select the correct answer",
              min_values: 1,
              max_values: 1,
              options: answers.map((answer) => ({
                label: answer.name.slice(0, 100),
                value: answer.id,
              })),
            },
          ],
        },
      ],
    });
  } catch (error) {
    await editOriginal(interaction, { content: errorMessage(error), components: [] });
  }
}

export async function scoreSelectedAnswer(
  interaction: ScoringInteraction,
  env: Env,
): Promise<void> {
  try {
    requireAdministrator(interaction);
    const customId = required(interaction.data.custom_id, "component ID");
    if (!customId.startsWith(SCORE_PREFIX)) throw new Error("Unknown scoring component.");

    const pollId = customId.slice(SCORE_PREFIX.length);
    const correctAnswerId = required(interaction.data.values?.[0], "correct answer");
    const client = new EasyPollClient(env.EASYPOLL_API_KEY);
    const [poll, answers, votes] = await Promise.all([
      client.getPoll(pollId),
      client.getAnswers(pollId),
      client.getVotes(pollId),
    ]);

    if (!poll.closedAt) throw new Error("This EasyPoll poll is no longer closed.");
    const correctAnswer = answers.find((answer) => answer.id === correctAnswerId);
    if (!correctAnswer) throw new Error("The selected answer does not belong to this poll.");

    const calculated = calculateScores(answers, votes, correctAnswerId);
    const repository = new ScoreRepository(env.SCOREBOT_DB);
    const result = await repository.scoreCase({
      guildId: required(interaction.guild_id, "guild ID"),
      channelId: required(poll.channelId ?? interaction.channel_id, "channel ID"),
      messageId: required(poll.messageId, "poll message ID"),
      pollId: poll.id,
      question: poll.question,
      correctAnswerId,
      correctAnswerText: correctAnswer.name,
      scoredByUserId: required(interaction.member?.user.id, "administrator user ID"),
      answers: calculated,
    });

    logEvent("info", result.alreadyScored ? "case_score_reused" : "case_scored", {
      actorUserId: interaction.member?.user.id,
      caseNumber: result.caseNumber,
      pollId: poll.id,
      participants: result.participants,
      pointsAwarded: result.correct,
    });

    const prefix = result.alreadyScored ? "Already scored" : "Scored";
    await editOriginal(interaction, {
      content: [
        `**${prefix} Case ${result.caseNumber}**`,
        `Correct answer: **${correctAnswer.name}**`,
        `Participants: ${result.participants}`,
        `Points awarded: ${result.correct}`,
      ].join("\n"),
      components: [],
    });
  } catch (error) {
    await editOriginal(interaction, { content: errorMessage(error), components: [] });
  }
}

export async function correctScoredCase(
  interaction: ScoringInteraction,
  env: Env,
): Promise<void> {
  try {
    requireAdministrator(interaction);
    const caseNumber = Number(commandOption(interaction, "case"));
    const answerReference = String(commandOption(interaction, "answer") ?? "").trim();
    if (!Number.isInteger(caseNumber) || caseNumber < 1 || !answerReference) {
      throw new Error("Supply a valid case number and answer.");
    }

    const repository = new ScoreRepository(env.SCOREBOT_DB);
    const scoredCase = await repository.getCase(caseNumber);
    if (!scoredCase) throw new Error(`Case ${caseNumber} has not been scored.`);

    const client = new EasyPollClient(env.EASYPOLL_API_KEY);
    const answers = await client.getAnswers(scoredCase.easypoll_poll_id);
    const numericPosition = /^\d+$/.test(answerReference) ? Number(answerReference) - 1 : -1;
    const correctedAnswer =
      (numericPosition >= 0 ? answers[numericPosition] : undefined) ??
      answers.find(
        (answer) =>
          answer.id === answerReference ||
          answer.name.toLocaleLowerCase() === answerReference.toLocaleLowerCase(),
      );
    if (!correctedAnswer) {
      const choices = answers.map((answer, index) => `${index + 1}. ${answer.name}`).join("; ");
      throw new Error(`Answer not found. Available answers: ${choices}`);
    }

    const result = await repository.correctCase(
      caseNumber,
      correctedAnswer.id,
      correctedAnswer.name,
      required(interaction.member?.user.id, "administrator user ID"),
    );
    logEvent("info", "case_corrected", {
      actorUserId: interaction.member?.user.id,
      caseNumber: result.caseNumber,
      correctAnswerId: correctedAnswer.id,
      pointsAwarded: result.correct,
    });
    await editOriginal(interaction, {
      content: [
        `**Corrected Case ${result.caseNumber}**`,
        `Correct answer: **${correctedAnswer.name}**`,
        `Participants: ${result.participants}`,
        `Points awarded: ${result.correct}`,
      ].join("\n"),
      components: [],
    });
  } catch (error) {
    await editOriginal(interaction, { content: errorMessage(error), components: [] });
  }
}

export function isScoreComponent(customId: string | undefined): boolean {
  return customId?.startsWith(SCORE_PREFIX) ?? false;
}

async function editOriginal(
  interaction: ScoringInteraction,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(
    `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new Error(`Discord webhook update failed (${response.status}): ${await response.text()}`);
  }
}

function requireAdministrator(interaction: ScoringInteraction): void {
  const permissions = BigInt(interaction.member?.permissions ?? "0");
  if ((permissions & ADMINISTRATOR) !== ADMINISTRATOR) {
    throw new Error("Administrator permission is required.");
  }
}

function required<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Discord did not supply the ${description}.`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  logEvent("error", "scoring_workflow_failed", errorFields(error));
  return error instanceof Error ? error.message : "Scorebot could not score this poll.";
}

function commandOption(
  interaction: ScoringInteraction,
  name: string,
): string | number | undefined {
  return interaction.data.options?.find((option) => option.name === name)?.value;
}
