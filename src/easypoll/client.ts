import type {
  EasyPollAnswer,
  EasyPollGuild,
  EasyPollPoll,
  EasyPollVote,
  Paginated,
} from "./types";

const BASE_URL = "https://easypoll.com/api/v1";
const PAGE_SIZE = 100;

export class EasyPollApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EasyPollApiError";
  }
}

export class EasyPollClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  async getPoll(pollId: string): Promise<EasyPollPoll> {
    return this.get<EasyPollPoll>(`/polls/${encodeURIComponent(pollId)}`);
  }

  async findPollByMessageId(
    guildId: string,
    messageId: string,
  ): Promise<EasyPollPoll | null> {
    const polls = await this.getAllPages<EasyPollPoll>(
      `/guilds/${encodeURIComponent(guildId)}/polls`,
    );
    return polls.find((poll) => poll.messageId === messageId) ?? null;
  }

  async resolvePoll(reference: string): Promise<EasyPollPoll> {
    if (isUuid(reference)) {
      return this.getPoll(reference);
    }

    const guilds = await this.get<EasyPollGuild[]>("/users/@me/guilds");
    const matches: EasyPollPoll[] = [];

    for (const guild of guilds) {
      if (!guild.hasBot || (!guild.hasAccess && !guild.maybeHasAccess)) continue;

      const polls = await this.getAllPages<EasyPollPoll>(
        `/guilds/${encodeURIComponent(guild.id)}/polls`,
      );
      matches.push(
        ...polls.filter(
          (poll) =>
            poll.messageId === reference ||
            poll.id.toLowerCase().startsWith(`${reference.toLowerCase()}-`),
        ),
      );
    }

    if (matches.length === 0) {
      throw new Error(`No EasyPoll poll matched '${reference}'.`);
    }
    if (matches.length > 1) {
      throw new Error(`Multiple EasyPoll polls matched '${reference}'.`);
    }
    return matches[0]!;
  }

  getAnswers(pollId: string): Promise<EasyPollAnswer[]> {
    return this.getAllPages<EasyPollAnswer>(
      `/polls/${encodeURIComponent(pollId)}/answers`,
    );
  }

  getVotes(pollId: string): Promise<EasyPollVote[]> {
    return this.getAllPages<EasyPollVote>(
      `/polls/${encodeURIComponent(pollId)}/votes`,
    );
  }

  private async getAllPages<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const separator = path.includes("?") ? "&" : "?";
      const response = await this.get<Paginated<T>>(
        `${path}${separator}limit=${PAGE_SIZE}&page=${page}`,
      );
      results.push(...response.data);
      totalPages = response.totalPages;
      page += 1;
    } while (page <= totalPages);

    return results;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetcher(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new EasyPollApiError(
        `EasyPoll request failed (${response.status}): ${body}`,
        response.status,
      );
    }

    return response.json<T>();
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
