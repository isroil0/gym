import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/test/next-mocks';
import { apiMock } from '@/test/api-mock';
import { renderWithProviders } from '@/test/render';
import { IncomeDialog } from '../IncomeDialog';

function body(): Record<string, unknown> {
  const call = apiMock.post.mock.calls.find(([path]) => path === 'accounting/entries');
  return (call?.[1] ?? {}) as Record<string, unknown>;
}

async function fill(user: ReturnType<typeof userEvent.setup>, amount = '500000') {
  await user.type(await screen.findByLabelText(/Amount/i), amount);
  await user.type(screen.getByLabelText(/Description/i), 'Drinks fridge');
}

describe('IncomeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({ data: [], meta: {} });
    apiMock.post.mockResolvedValue({ id: 'entry-1' });
  });

  it('records the entry as income', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<IncomeDialog open onClose={() => {}} />);

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('accounting/entries', expect.anything()));
    expect(body()).toMatchObject({
      type: 'INCOME',
      amount: 500000,
      description: 'Drinks fridge',
    });
  });

  it('sends no expense category — the backend refuses income carrying one', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<IncomeDialog open onClose={() => {}} />);

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    expect(body()).not.toHaveProperty('expenseCategoryId');
    expect(body()).not.toHaveProperty('trainerId');
  });

  it('does not ask for a category', async () => {
    await renderWithProviders(<IncomeDialog open onClose={() => {}} />);
    await screen.findByLabelText(/Amount/i);

    expect(screen.queryByLabelText(/Category/i)).not.toBeInTheDocument();
  });

  it('defaults to today and will not accept a future date', async () => {
    await renderWithProviders(<IncomeDialog open onClose={() => {}} />);

    const date = (await screen.findByLabelText(/Date/i)) as HTMLInputElement;
    const today = new Date().toISOString().slice(0, 10);
    expect(date.value).toBe(today);
    expect(date.max).toBe(today);
  });

  it('refuses an empty form', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<IncomeDialog open onClose={() => {}} />);
    await screen.findByLabelText(/Amount/i);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.post).not.toHaveBeenCalled());
  });

  it('keeps the dialog open and reports the reason when the server refuses', async () => {
    apiMock.post.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    await renderWithProviders(<IncomeDialog open onClose={() => {}} />);

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    expect(await screen.findByLabelText(/Amount/i)).toBeInTheDocument();
  });
});
