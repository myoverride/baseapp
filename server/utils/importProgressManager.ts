export interface ImportProgress {
  total: number;
  processed: number;
  errors: string[];
  status: 'running' | 'completed' | 'failed';
}

export const importProgressMap = new Map<string, ImportProgress>();
