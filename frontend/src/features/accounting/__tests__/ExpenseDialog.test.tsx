import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/test/next-mocks';
import { apiMock } from '@/test/api-mock';
import { renderWithProviders } from '@/test/render';
import { ExpenseDialog } from '../ExpenseDialog';

const CATEGORIES = {
  data: [
    { id: 'cat-rent', name: 'Rent', description: null },
    { id: 'cat-other', name: 'Other', description: null },
  ],
  meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
};

/** Fills the fields a user still has to answer, then saves. */
async function recordExpense(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/Amount/i), '250');
  await user.type(screen.getByLabelText(/Description/i), 'October rent');
  await user.click(screen.getByRole('button', { name: 'Save' }));
}

describe('ExpenseDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue(CATEGORIES);
    apiMock.post.mockResolvedValue({ id: 'entry-1' });
  });

  it('does not ask for a category', async () => {
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);
    await screen.findByLabelText(/Amount/i);

    expect(screen.queryByLabelText(/Category/i)).not.toBeInTheDocument();
  });

  it('still sends a category, because the backend refuses an expense without one', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await recordExpense(user);

    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    const [path, body] = apiMock.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('accounting/entries');
    expect(body.expenseCategoryId).toBe('cat-other');
    expect(body).toMatchObject({ type: 'EXPENSE', amount: 250, description: 'October rent' });
  });

  it('files the expense under any category when there is no "Other"', async () => {
    apiMock.get.mockResolvedValue({ ...CATEGORIES, data: [CATEGORIES.data[0]] });
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await recordExpense(user);

    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    const [, body] = apiMock.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.expenseCategoryId).toBe('cat-rent');
  });

  it('says so rather than sending a request the backend will refuse', async () => {
    apiMock.get.mockResolvedValue({ ...CATEGORIES, data: [] });
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await recordExpense(user);

    expect(await screen.findByText(/No expense category exists/)).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('still validates the fields it does ask for', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);
    await screen.findByLabelText(/Amount/i);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.post).not.toHaveBeenCalled());
  });

  it('keeps the trainer attribution used for paying salaries', async () => {
    const user = userEvent.setup();
    await renderWithProviders(
      <ExpenseDialog open onClose={() => {}} trainerId="tr-1" trainerName="Ali Valiyev" />,
    );

    await user.type(await screen.findByLabelText(/Amount/i), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    const [, body] = apiMock.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toMatchObject({ trainerId: 'tr-1', expenseCategoryId: 'cat-other' });
  });
});
