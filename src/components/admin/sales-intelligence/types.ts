export interface ResearchResult {
  success: boolean;
  company: { id?: string; name: string; domain?: string };
  contacts: Array<{ id: string; email: string; name?: string }>;
  hunter_contacts_found: number;
  questions_and_answers: Array<{ question: string; answer: string; relevance_score: number }>;
  company_summary: {
    name?: string;
    industry?: string;
    size_estimate?: string;
    main_offerings?: string[];
    potential_pain_points?: string[];
  };
  error?: string;
}

export interface FitAnalysisResult {
  success: boolean;
  fit_score: number;
  fit_advice: string;
  problem_mapping: Array<{ prospect_problem: string; our_solution: string }>;
  introduction_letter: string;
  email_subject: string;
  decision_maker: {
    email: string;
    confidence: number;
    first_name: string;
    last_name: string;
    position: string;
  } | null;
  leads_updated: number;
}
