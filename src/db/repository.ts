export interface LeaderboardRow {
  discord_user_id: string;
  display_name: string | null;
  username: string;
  scored_points: number;
  imported_points: number;
  total_points: number;
}

export interface PlayerStatsRow extends LeaderboardRow {
  cases_played: number;
  correct_answers: number;
}

export interface CaseRow {
  id: number;
  case_number: number;
  question: string;
  correct_answer_text: string;
  correct_answer_id: string;
  discord_message_id: string;
  scored_at: string;
  participant_count: number;
  correct_count: number;
  easypoll_poll_id: string;
}

export interface CaseAnswerRow {
  discord_user_id: string;
  display_name: string | null;
  username: string;
  selected_answer_text: string;
  points: number;
}

export interface DiscordUserInput {
  id: string;
  username: string;
  globalName: string | null;
}

export interface ScoreCaseInput {
  guildId: string;
  channelId: string;
  messageId: string;
  pollId: string;
  question: string;
  correctAnswerId: string;
  correctAnswerText: string;
  scoredByUserId: string;
  answers: Array<{
    voteId: string;
    discordUserId: string;
    username: string;
    displayName: string | null;
    selectedAnswerId: string;
    selectedAnswerText: string;
    points: 0 | 1;
    weight: number;
    votedAt: string;
  }>;
}

export interface ScoreCaseResult {
  caseNumber: number;
  participants: number;
  correct: number;
  alreadyScored: boolean;
}

export interface CorrectCaseResult {
  caseNumber: number;
  participants: number;
  correct: number;
}

export class ScoreRepository {
  constructor(private readonly database: D1Database) {}

  async getLeaderboard(limit = 15, offset = 0): Promise<LeaderboardRow[]> {
    const result = await this.database
      .prepare(
        `SELECT
           p.discord_user_id,
           p.display_name,
           p.username,
           COALESCE(SUM(a.points), 0) AS scored_points,
           COALESCE(i.points, 0) AS imported_points,
           COALESCE(SUM(a.points), 0) + COALESCE(i.points, 0) AS total_points
         FROM players p
         LEFT JOIN answers a ON a.discord_user_id = p.discord_user_id
         LEFT JOIN legacy_score_imports i ON i.discord_user_id = p.discord_user_id
         GROUP BY p.discord_user_id, p.display_name, p.username, i.points
         ORDER BY total_points DESC, p.username COLLATE NOCASE ASC, p.discord_user_id ASC
         LIMIT ? OFFSET ?`,
      )
      .bind(limit, offset)
      .all<LeaderboardRow>();
    return result.results;
  }

  async getPlayerCount(): Promise<number> {
    const row = await this.database
      .prepare("SELECT COUNT(*) AS count FROM players")
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  }

  async getPlayerStats(discordUserId: string): Promise<PlayerStatsRow | null> {
    return this.database
      .prepare(
        `SELECT
           p.discord_user_id,
           p.display_name,
           p.username,
           COUNT(a.id) AS cases_played,
           COALESCE(SUM(a.points), 0) AS correct_answers,
           COALESCE(SUM(a.points), 0) AS scored_points,
           COALESCE(i.points, 0) AS imported_points,
           COALESCE(SUM(a.points), 0) + COALESCE(i.points, 0) AS total_points
         FROM players p
         LEFT JOIN answers a ON a.discord_user_id = p.discord_user_id
         LEFT JOIN legacy_score_imports i ON i.discord_user_id = p.discord_user_id
         WHERE p.discord_user_id = ?
         GROUP BY p.discord_user_id, p.display_name, p.username, i.points`,
      )
      .bind(discordUserId)
      .first<PlayerStatsRow>();
  }

  async getCase(caseNumber: number): Promise<CaseRow | null> {
    return this.database
      .prepare(
        `SELECT
           c.id,
           c.case_number,
           c.question,
           c.correct_answer_id,
           c.correct_answer_text,
           c.discord_message_id,
           c.easypoll_poll_id,
           c.scored_at,
           COUNT(a.id) AS participant_count,
           COALESCE(SUM(a.points), 0) AS correct_count
         FROM cases c
         LEFT JOIN answers a ON a.case_id = c.id
         WHERE c.case_number = ?
         GROUP BY c.id`,
      )
      .bind(caseNumber)
      .first<CaseRow>();
  }

  async getCaseByPollId(pollId: string): Promise<CaseRow | null> {
    return this.database
      .prepare(
        `SELECT
           c.id,
           c.case_number,
           c.question,
           c.correct_answer_id,
           c.correct_answer_text,
           c.discord_message_id,
           c.easypoll_poll_id,
           c.scored_at,
           COUNT(a.id) AS participant_count,
           COALESCE(SUM(a.points), 0) AS correct_count
         FROM cases c
         LEFT JOIN answers a ON a.case_id = c.id
         WHERE c.easypoll_poll_id = ?
         GROUP BY c.id`,
      )
      .bind(pollId)
      .first<CaseRow>();
  }

  async getCaseAnswers(caseId: number, limit = 15, offset = 0): Promise<CaseAnswerRow[]> {
    const result = await this.database
      .prepare(
        `SELECT
           a.discord_user_id,
           p.display_name,
           p.username,
           a.selected_answer_text,
           a.points
         FROM answers a
         JOIN players p ON p.discord_user_id = a.discord_user_id
         WHERE a.case_id = ?
         ORDER BY a.points DESC, p.username COLLATE NOCASE ASC
         LIMIT ? OFFSET ?`,
      )
      .bind(caseId, limit, offset)
      .all<CaseAnswerRow>();
    return result.results;
  }

  async importLegacyScore(
    user: DiscordUserInput,
    points: number,
    importedByUserId: string,
  ): Promise<void> {
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO players (discord_user_id, username, display_name)
           VALUES (?, ?, ?)
           ON CONFLICT (discord_user_id) DO UPDATE SET
             username = excluded.username,
             display_name = excluded.display_name,
             updated_at = datetime('now')`,
        )
        .bind(user.id, user.username, user.globalName),
      this.database
        .prepare(
          `INSERT INTO legacy_score_imports
             (discord_user_id, points, imported_by_user_id)
           VALUES (?, ?, ?)
           ON CONFLICT (discord_user_id) DO UPDATE SET
             points = excluded.points,
             imported_by_user_id = excluded.imported_by_user_id,
             updated_at = datetime('now')`,
        )
        .bind(user.id, points, importedByUserId),
    ]);
  }

  async scoreCase(input: ScoreCaseInput): Promise<ScoreCaseResult> {
    const existing = await this.getCaseByPollId(input.pollId);
    if (existing) {
      return {
        caseNumber: existing.case_number,
        participants: existing.participant_count,
        correct: existing.correct_count,
        alreadyScored: true,
      };
    }

    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `INSERT INTO cases (
             case_number, guild_id, channel_id, discord_message_id,
             easypoll_poll_id, question, correct_answer_id,
             correct_answer_text, scored_by_user_id
           )
           SELECT COALESCE(MAX(case_number), 30) + 1, ?, ?, ?, ?, ?, ?, ?, ?
           FROM cases
           RETURNING case_number`,
        )
        .bind(
          input.guildId,
          input.channelId,
          input.messageId,
          input.pollId,
          input.question,
          input.correctAnswerId,
          input.correctAnswerText,
          input.scoredByUserId,
        ),
    ];

    for (const answer of input.answers) {
      statements.push(
        this.database
          .prepare(
            `INSERT INTO players (discord_user_id, username, display_name)
             VALUES (?, ?, ?)
             ON CONFLICT (discord_user_id) DO UPDATE SET
               username = excluded.username,
               display_name = excluded.display_name,
               updated_at = datetime('now')`,
          )
          .bind(answer.discordUserId, answer.username, answer.displayName),
        this.database
          .prepare(
            `INSERT INTO answers (
               case_id, discord_user_id, easypoll_vote_id,
               selected_answer_id, selected_answer_text, points,
               vote_weight, voted_at
             )
             SELECT id, ?, ?, ?, ?, ?, ?, ?
             FROM cases WHERE easypoll_poll_id = ?`,
          )
          .bind(
            answer.discordUserId,
            answer.voteId,
            answer.selectedAnswerId,
            answer.selectedAnswerText,
            answer.points,
            answer.weight,
            answer.votedAt,
            input.pollId,
          ),
      );
    }

    try {
      const results = await this.database.batch<Record<string, unknown>>(statements);
      const caseNumber = Number(results[0]?.results[0]?.case_number);
      if (!Number.isInteger(caseNumber)) throw new Error("D1 did not return a case number.");

      return {
        caseNumber,
        participants: input.answers.length,
        correct: input.answers.filter((answer) => answer.points === 1).length,
        alreadyScored: false,
      };
    } catch (error) {
      const raced = await this.getCaseByPollId(input.pollId);
      if (!raced) throw error;
      return {
        caseNumber: raced.case_number,
        participants: raced.participant_count,
        correct: raced.correct_count,
        alreadyScored: true,
      };
    }
  }

  async correctCase(
    caseNumber: number,
    correctAnswerId: string,
    correctAnswerText: string,
    correctedByUserId: string,
  ): Promise<CorrectCaseResult> {
    const scoredCase = await this.getCase(caseNumber);
    if (!scoredCase) throw new Error(`Case ${caseNumber} has not been scored.`);

    await this.database.batch([
      this.database
        .prepare(
          `UPDATE cases SET
             correct_answer_id = ?,
             correct_answer_text = ?,
             corrected_by_user_id = ?,
             corrected_at = datetime('now')
           WHERE case_number = ?`,
        )
        .bind(correctAnswerId, correctAnswerText, correctedByUserId, caseNumber),
      this.database
        .prepare(
          `UPDATE answers SET
             points = CASE WHEN selected_answer_id = ? THEN 1 ELSE 0 END,
             updated_at = datetime('now')
           WHERE case_id = (SELECT id FROM cases WHERE case_number = ?)`,
        )
        .bind(correctAnswerId, caseNumber),
    ]);

    const corrected = await this.getCase(caseNumber);
    if (!corrected) throw new Error(`Case ${caseNumber} disappeared during correction.`);
    return {
      caseNumber: corrected.case_number,
      participants: corrected.participant_count,
      correct: corrected.correct_count,
    };
  }
}
