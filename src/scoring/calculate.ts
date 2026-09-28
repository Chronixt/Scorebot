import type { EasyPollAnswer, EasyPollVote } from "../easypoll/types";

export interface CalculatedAnswer {
  voteId: string;
  discordUserId: string;
  username: string;
  displayName: string | null;
  selectedAnswerId: string;
  selectedAnswerText: string;
  points: 0 | 1;
  weight: number;
  votedAt: string;
}

export function calculateScores(
  answers: EasyPollAnswer[],
  votes: EasyPollVote[],
  correctAnswerId: string,
): CalculatedAnswer[] {
  const answerTextById = new Map(answers.map((answer) => [answer.id, answer.name]));
  const seenUsers = new Set<string>();

  if (!answerTextById.has(correctAnswerId)) {
    throw new Error("The correct answer does not belong to this poll.");
  }

  return votes.map((vote) => {
    if (seenUsers.has(vote.user.id)) {
      throw new Error(
        `User '${vote.user.id}' has more than one vote; scoring requires a single-choice poll.`,
      );
    }
    seenUsers.add(vote.user.id);

    const selectedAnswerText = answerTextById.get(vote.answerId);
    if (selectedAnswerText === undefined) {
      throw new Error(`Vote '${vote.id}' references an unknown answer.`);
    }

    return {
      voteId: vote.id,
      discordUserId: vote.user.id,
      username: vote.user.username,
      displayName: vote.user.globalName,
      selectedAnswerId: vote.answerId,
      selectedAnswerText,
      points: vote.answerId === correctAnswerId ? 1 : 0,
      weight: vote.weight,
      votedAt: vote.createdAt,
    };
  });
}
