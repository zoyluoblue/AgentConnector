export type ConversationRole = "user" | "assistant" | "system";

export interface PronunciationFeedback {
  score?: number;
  summary: string;
  suggestions: string[];
}

export interface Message {
  role: ConversationRole;
  content: string;
  audioUrl?: string;
  feedback?: PronunciationFeedback;
}

export interface ConversationSession {
  id: string;
  topic: string;
  messages: Message[];
  startedAt: string;
}
