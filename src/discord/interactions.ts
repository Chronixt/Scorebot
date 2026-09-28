import { InteractionResponseType } from "discord-interactions";
import { ScoreRepository } from "../db/repository";
import type { Env } from "../env";
import { errorFields, logEvent } from "../logging";
import { correctScoredCase, deferEphemeral, prepareScoreSelection } from "./scoring";

const EPHEMERAL = 64;
const ADMINISTRATOR = 8n;
const PAGE_SIZE = 15;
const LEADERBOARD_PREFIX = "leaderboard-page:";
const CASE_PREFIX = "case-page:";

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
}

interface CommandOption {
  name: string;
  value: string | number;
}

export interface ApplicationCommandInteraction {
  type: number;
  application_id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  data: {
    name: string;
    target_id?: string;
    options?: CommandOption[];
    resolved?: { users?: Record<string, DiscordUser> };
  };
  member?: {
    permissions: string;
    user: DiscordUser;
  };
  user?: DiscordUser;
}

interface InteractionMessage {
  type: number;
  data: {
    content: string;
    flags?: number;
    components?: DiscordActionRow[];
  };
}

interface DiscordActionRow {
  type: 1;
  components: Array<{
    type: 2;
    style: 2;
    custom_id: string;
    label: string;
    disabled: boolean;
  }>;
}

interface RenderedPage {
  content: string;
  components: DiscordActionRow[];
}

export async function handleApplicationCommand(
  interaction: ApplicationCommandInteraction,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  const repository = new ScoreRepository(env.SCOREBOT_DB);

  try {
    switch (interaction.data.name) {
      case "leaderboard":
        return pageMessage(await renderLeaderboard(repository, 0));
      case "stats":
        return message(await formatStats(interaction, repository));
      case "case":
        return pageMessage(
          await renderCase(repository, Number(option(interaction, "number")), 0),
        );
      case "importscore":
        return handleImport(interaction, repository);
      case "correct":
        context.waitUntil(correctScoredCase(interaction, env));
        return deferEphemeral();
      case "Score Fact or Fictoid":
        context.waitUntil(prepareScoreSelection(interaction, env));
        return deferEphemeral();
      default:
        return message("Unknown command.", EPHEMERAL);
    }
  } catch (error) {
    logEvent("error", "command_failed", {
      command: interaction.data.name,
      ...errorFields(error),
    });
    return message("Scorebot could not complete that command. Please try again.", EPHEMERAL);
  }
}

export async function handlePaginationComponent(
  customId: string,
  env: Env,
): Promise<Response> {
  const repository = new ScoreRepository(env.SCOREBOT_DB);
  try {
    if (customId.startsWith(LEADERBOARD_PREFIX)) {
      const page = parseNonNegativeInteger(customId.slice(LEADERBOARD_PREFIX.length));
      return updateMessage(await renderLeaderboard(repository, page));
    }

    if (customId.startsWith(CASE_PREFIX)) {
      const [caseNumberValue, pageValue] = customId.slice(CASE_PREFIX.length).split(":");
      const caseNumber = parsePositiveInteger(caseNumberValue);
      const page = parseNonNegativeInteger(pageValue);
      return updateMessage(await renderCase(repository, caseNumber, page));
    }

    return message("Unknown pagination control.", EPHEMERAL);
  } catch (error) {
    logEvent("error", "pagination_failed", { customId, ...errorFields(error) });
    return message("Scorebot could not load that page. Please run the command again.", EPHEMERAL);
  }
}

export function isPaginationComponent(customId: string | undefined): boolean {
  return (
    customId?.startsWith(LEADERBOARD_PREFIX) === true ||
    customId?.startsWith(CASE_PREFIX) === true
  );
}

async function renderLeaderboard(
  repository: ScoreRepository,
  requestedPage: number,
): Promise<RenderedPage> {
  const total = await repository.getPlayerCount();
  if (total === 0) return { content: "No scores have been recorded yet.", components: [] };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const page = Math.min(requestedPage, totalPages - 1);
  const rows = await repository.getLeaderboard(PAGE_SIZE, page * PAGE_SIZE);

  const lines = rows.map(
    (row, index) =>
      `${page * PAGE_SIZE + index + 1}. <@${row.discord_user_id}> - **${row.total_points}** point${row.total_points === 1 ? "" : "s"}`,
  );
  return {
    content: `**Fact or Fictoid Leaderboard**\n${lines.join("\n")}\n\nPage ${page + 1} of ${totalPages}`,
    components:
      totalPages > 1
        ? paginationButtons(
            `${LEADERBOARD_PREFIX}${page - 1}`,
            `${LEADERBOARD_PREFIX}${page + 1}`,
            page === 0,
            page >= totalPages - 1,
          )
        : [],
  };
}

async function formatStats(
  interaction: ApplicationCommandInteraction,
  repository: ScoreRepository,
): Promise<string> {
  const requestedId = option(interaction, "user")?.toString();
  const userId = requestedId ?? invokingUser(interaction).id;
  const stats = await repository.getPlayerStats(userId);
  if (!stats) return `<@${userId}> has no recorded scores.`;

  const accuracy =
    stats.cases_played === 0
      ? "N/A"
      : `${Math.round((stats.correct_answers / stats.cases_played) * 100)}%`;
  return [
    `**Stats for <@${userId}>**`,
    `Total points: **${stats.total_points}**`,
    `Scored cases: ${stats.cases_played}`,
    `Correct answers: ${stats.correct_answers}`,
    `Accuracy: ${accuracy}`,
    `Cases 1-30 import: ${stats.imported_points}`,
  ].join("\n");
}

async function renderCase(
  repository: ScoreRepository,
  caseNumber: number,
  requestedPage: number,
): Promise<RenderedPage> {
  const scoredCase = await repository.getCase(caseNumber);
  if (!scoredCase) {
    return { content: `Case ${caseNumber} has not been scored.`, components: [] };
  }

  const totalPages = Math.max(1, Math.ceil(scoredCase.participant_count / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages - 1);
  const answers = await repository.getCaseAnswers(
    scoredCase.id,
    PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const resultLines = answers.map(
    (answer) =>
      `${answer.points === 1 ? "Correct" : "Wrong"}: <@${answer.discord_user_id}> - ${answer.selected_answer_text}`,
  );

  const content = [
    `**Case ${scoredCase.case_number}: ${scoredCase.question}**`,
    `Correct answer: **${scoredCase.correct_answer_text}**`,
    `Participants: ${scoredCase.participant_count}`,
    `Correct: ${scoredCase.correct_count}`,
    "",
    ...resultLines,
    "",
    `Page ${page + 1} of ${totalPages}`,
  ].join("\n");

  return {
    content: content.slice(0, 2000),
    components:
      totalPages > 1
        ? paginationButtons(
            `${CASE_PREFIX}${caseNumber}:${page - 1}`,
            `${CASE_PREFIX}${caseNumber}:${page + 1}`,
            page === 0,
            page >= totalPages - 1,
          )
        : [],
  };
}

async function handleImport(
  interaction: ApplicationCommandInteraction,
  repository: ScoreRepository,
): Promise<Response> {
  if (!isAdministrator(interaction)) {
    return message("Administrator permission is required.", EPHEMERAL);
  }

  const userId = String(option(interaction, "user"));
  const points = Number(option(interaction, "points"));
  const user = interaction.data.resolved?.users?.[userId];
  if (!user || !Number.isInteger(points) || points < 0) {
    return message("Discord supplied invalid import details.", EPHEMERAL);
  }

  await repository.importLegacyScore(
    { id: user.id, username: user.username, globalName: user.global_name },
    points,
    invokingUser(interaction).id,
  );
  logEvent("info", "legacy_score_imported", {
    actorUserId: invokingUser(interaction).id,
    targetUserId: user.id,
    points,
  });
  return message(`Set <@${user.id}>'s Cases 1-30 score to **${points}**.`, EPHEMERAL);
}

function option(
  interaction: ApplicationCommandInteraction,
  name: string,
): string | number | undefined {
  return interaction.data.options?.find((item) => item.name === name)?.value;
}

function invokingUser(interaction: ApplicationCommandInteraction): DiscordUser {
  const user = interaction.member?.user ?? interaction.user;
  if (!user) throw new Error("Interaction has no invoking user.");
  return user;
}

function isAdministrator(interaction: ApplicationCommandInteraction): boolean {
  return (BigInt(interaction.member?.permissions ?? "0") & ADMINISTRATOR) === ADMINISTRATOR;
}

function message(content: string, flags?: number): Response {
  const response: InteractionMessage = {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, ...(flags === undefined ? {} : { flags }) },
  };
  return Response.json(response);
}

function pageMessage(page: RenderedPage): Response {
  const response: InteractionMessage = {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: page.content, components: page.components },
  };
  return Response.json(response);
}

function updateMessage(page: RenderedPage): Response {
  return Response.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: { content: page.content, components: page.components },
  });
}

function paginationButtons(
  previousId: string,
  nextId: string,
  previousDisabled: boolean,
  nextDisabled: boolean,
): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          custom_id: previousId,
          label: "Previous",
          disabled: previousDisabled,
        },
        {
          type: 2,
          style: 2,
          custom_id: nextId,
          label: "Next",
          disabled: nextDisabled,
        },
      ],
    },
  ];
}

function parseNonNegativeInteger(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("Invalid page number.");
  return parsed;
}

function parsePositiveInteger(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("Invalid case number.");
  return parsed;
}
