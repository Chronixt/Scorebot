export interface Paginated<T> {
  data: T[];
  total: number;
  limit: number;
  page: number;
  totalPages: number;
}

export interface EasyPollGuild {
  id: string;
  name: string;
  hasBot: boolean;
  hasAccess: boolean;
  maybeHasAccess: boolean;
}

export interface EasyPollUser {
  id: string;
  username: string;
  globalName: string | null;
}

export interface EasyPollPoll {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  question: string;
  closedAt: string | null;
  failed: boolean;
}

export interface EasyPollAnswer {
  id: string;
  name: string;
  position: number;
}

export interface EasyPollVote {
  id: string;
  user: EasyPollUser;
  pollId: string;
  answerId: string;
  weight: number;
  createdAt: string;
  updatedAt: string;
}
