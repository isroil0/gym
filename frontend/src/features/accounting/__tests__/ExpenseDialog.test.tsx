import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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

/** The body of the single POST that records the expense. */
function entryBody(): Record<string, unknown> {
  const call = apiMock.post.mock.calls.find(([path]) => path === 'accounting/entries');
  return (call?.[1] ?? {}) as Record<string, unknown>;
}

async function fillAmountAndDescription(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/Amount/i), '250');
  await user.type(screen.getByLabelText(/Description/i), 'October rent');
}

describe('ExpenseDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue(CATEGORIES);
    apiMock.post.mockImplementation((path: string) =>
      path === 'accounting/expense-categories'
        ? Promise.resolve({ id: 'cat-new', name: 'Equipment' })
        : Promise.resolve({ id: 'entry-1' }),
    );
  });

  it('asks for a category', async () => {
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    expect(await screen.findByLabelText(/Category/i)).toBeInTheDocument();
  });

  it('offers the categories the gym already has', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await user.click(await screen.findByLabelText(/Category/i));

    const list = await screen.findByRole('listbox');
    expect(within(list).getByText('Rent')).toBeInTheDocument();
    expect(within(list).getByText('Other')).toBeInTheDocument();
  });

  it('files the expense under a category picked from the list', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await user.click(await screen.findByLabelText(/Category/i));
    await user.click(await screen.findByText('Rent'));
    await fillAmountAndDescription(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(entryBody().expenseCategoryId).toBe('cat-rent'));
    // Picking an existing one must not create anything.
    expect(apiMock.post).not.toHaveBeenCalledWith('accounting/expense-categories', expect.anything());
  });

  it('offers to add a name that is not in the list', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await user.type(await screen.findByLabelText(/Category/i), 'Equipment');

    expect(await screen.findByText('Add "Equipment"')).toBeInTheDocument();
  });

  it('creates a typed category and files the expense under it', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await user.type(await screen.findByLabelText(/Category/i), 'Equipment');
    await user.click(await screen.findByText('Add "Equipment"'));
    await fillAmountAndDescription(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('accounting/expense-categories', {
        name: 'Equipment',
      }),
    );
    expect(entryBody().expenseCategoryId).toBe('cat-new');
  });

  it('accepts a name typed without ever opening the list', async () => {
    // Somebody who types and tabs straight on must not lose what they typed.
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await user.type(await screen.findByLabelText(/Category/i), 'Equipment');
    await fillAmountAndDescription(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(entryBody().expenseCategoryId).toBe('cat-new'));
  });

  it('reuses an existing category typed in a different case', async () => {
    // Otherwise the reports would show "Rent" and "rent" side by side.
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await user.type(await screen.findByLabelText(/Category/i), 'rent');
    await fillAmountAndDescription(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(entryBody().expenseCategoryId).toBe('cat-rent'));
    expect(apiMock.post).not.toHaveBeenCalledWith('accounting/expense-categories', expect.anything());
  });

  it('does not offer to add a name that already exists in another case', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await user.type(await screen.findByLabelText(/Category/i), 'rent');

    expect(screen.queryByText('Add "rent"')).not.toBeInTheDocument();
  });

  it('refuses to save without a category', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await fillAmountAndDescription(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.post).not.toHaveBeenCalled());
  });

  it('records nothing when the category cannot be created', async () => {
    // The expense must not be filed under the wrong thing, or twice.
    apiMock.post.mockImplementation((path: string) =>
      path === 'accounting/expense-categories'
        ? Promise.reject(new Error('conflict'))
        : Promise.resolve({ id: 'entry-1' }),
    );
    const user = userEvent.setup();
    await renderWithProviders(<ExpenseDialog open onClose={() => {}} />);

    await user.type(await screen.findByLabelText(/Category/i), 'Equipment');
    await fillAmountAndDescription(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('accounting/expense-categories', {
        name: 'Equipment',
      }),
    );
    expect(apiMock.post).not.toHaveBeenCalledWith('accounting/entries', expect.anything());
  });

  it('keeps the trainer attribution used for paying salaries', async () => {
    const user = userEvent.setup();
    await renderWithProviders(
      <ExpenseDialog open onClose={() => {}} trainerId="tr-1" trainerName="Ali Valiyev" />,
    );

    await user.click(await screen.findByLabelText(/Category/i));
    await user.click(await screen.findByText('Other'));
    await user.type(screen.getByLabelText(/Amount/i), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(entryBody()).toMatchObject({ trainerId: 'tr-1', expenseCategoryId: 'cat-other' }),
    );
  });
});
