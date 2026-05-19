import { type Budget, type Expense } from '../db/db';

export const DEFAULT_VOTEHEADS = ['Utility', 'Rent', 'Salary', 'Tithe', 'Operations', 'Marketing'];

export const DEFAULT_MONTHLY_BUDGETS: Record<string, number> = {
  Utility: 25000,
  Rent: 55000,
  Salary: 180000,
  Tithe: 15000,
  Operations: 35000,
  Marketing: 45000,
};

export const DEFAULT_QUICK_TAGS: Record<string, string[]> = {
  Utility: ['Electricity', 'Water', 'Internet', 'Transport'],
  Rent: ['Office Space', 'Storage', 'Co-working'],
  Salary: ['Freelance', 'Full-time', 'Bonus'],
  Tithe: ['Ministry', 'Community', 'Project Support'],
  Operations: ['Petty Cash', 'Repairs', 'Cleaning'],
  Marketing: ['Social Ads', 'SEO', 'Print', 'Events'],
};

export function normalizeVoteheadName(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export function getVoteheadsFromBudgets(budgets?: Budget[]) {
  if (!budgets?.length) return DEFAULT_VOTEHEADS;

  const unique = new Map<string, string>();
  for (const budget of budgets) {
    const name = normalizeVoteheadName(budget.votehead || '');
    if (name) unique.set(name.toLowerCase(), name);
  }

  return unique.size ? Array.from(unique.values()).sort((a, b) => a.localeCompare(b)) : DEFAULT_VOTEHEADS;
}

export function getVoteheadsFromExpenses(expenses?: Expense[]) {
  const unique = new Map<string, string>();
  for (const expense of expenses || []) {
    const name = normalizeVoteheadName(expense.category || '');
    if (name) unique.set(name.toLowerCase(), name);
  }
  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
}

export function getVoteheadsFromBudgetsAndExpenses(budgets?: Budget[], expenses?: Expense[]) {
  const unique = new Map<string, string>();

  for (const name of getVoteheadsFromBudgets(budgets)) {
    unique.set(name.toLowerCase(), name);
  }
  for (const name of getVoteheadsFromExpenses(expenses)) {
    unique.set(name.toLowerCase(), name);
  }

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
}

export function getMonthlyBudgetForVotehead(votehead: string, budgets?: Budget[]) {
  const match = budgets?.find(item => item.votehead.toLowerCase() === votehead.toLowerCase());
  return Number(match?.monthly_limit) || DEFAULT_MONTHLY_BUDGETS[votehead] || 1;
}

export function getQuickTagsForVotehead(votehead: string) {
  return DEFAULT_QUICK_TAGS[votehead] || ['General', 'One-off', 'Recurring'];
}
