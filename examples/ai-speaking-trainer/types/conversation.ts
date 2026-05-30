export type ConversationRole = "user" | "assistant" | "system";

export interface ConversationFeedback {
  score?: number;
  summary: string;
  suggestions: string[];
  naturalAlternatives?: string[];
  idioms?: string[];
}

export interface ConversationTurn {
  role: ConversationRole;
  text: string;
  audioUrl?: string;
  feedback?: ConversationFeedback;
}

export interface Session {
  id: string;
  turns: ConversationTurn[];
  topic: string;
  startedAt: string;
}
