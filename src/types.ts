export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  logoHtml?: string;
  role: 'admin' | 'editor';
  companyId?: string;
  createdAt: number;
}

export interface Poll {
  id: string;
  title: string;
  createdAt: number;
  status: 'draft' | 'active' | 'closed';
  currentQuestionId?: string;
  showQR?: boolean;
  creatorId: string;
  joinCode?: string;
  isDeleted?: boolean;
  deletedAt?: number;
  type?: 'event' | 'challenge';
  penaltyParticipant?: string;
  penaltyAdmin?: string;
}

export type QuestionType = 'text' | 'multiple-choice' | 'rating' | 'comparison' | 'four-options' | 'true-false' | 'brainstorm' | 'word-cloud' | 'open-ended' | 'guess-name' | 'complete-sequence';

export interface Question {
  id: string;
  pollId: string;
  text: string;
  type: QuestionType;
  options?: string[]; // For multiple choice
  optionAImage?: string; // For comparison
  optionBImage?: string; // For comparison
  imageUrl?: string; // For guess-name (question image)
  correctAnswer?: string; // For guess-name / complete-sequence correct answer
  sequenceItems?: string[]; // For complete-sequence
  sequenceMissingIndex?: number; // For complete-sequence missing element index
  order: number;
}

export interface Response {
  id: string;
  pollId: string;
  questionId: string;
  text?: string;
  value?: string | number; // For multiple choice or rating
  group?: string; // For grouping brainstorm ideas
  participantName: string;
  participantCode?: string;
  createdAt: number;
}
