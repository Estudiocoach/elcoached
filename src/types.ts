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
}

export type QuestionType = 'text' | 'multiple-choice' | 'rating' | 'comparison';

export interface Question {
  id: string;
  pollId: string;
  text: string;
  type: QuestionType;
  options?: string[]; // For multiple choice
  optionAImage?: string; // For comparison
  optionBImage?: string; // For comparison
  order: number;
}

export interface Response {
  id: string;
  pollId: string;
  questionId: string;
  text?: string;
  value?: string | number; // For multiple choice or rating
  participantName: string;
  participantCode?: string;
  createdAt: number;
}
