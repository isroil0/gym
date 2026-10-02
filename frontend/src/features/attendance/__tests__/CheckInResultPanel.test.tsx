import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import '@/test/next-mocks';
import { renderWithProviders } from '@/test/render';
import { CheckInResultPanel } from '../CheckInResultPanel';
import { ApiError } from '@/lib/api/errors';
import { ENTRY_DENIAL_REASONS } from '@/lib/api/types';
import type { CheckInResult } from '../useAttendance';

function admitted(overrides: Partial<CheckInResult> = {}): CheckInResult {
  return {
    admitted: true,
    attendance: {
      id: 'a-1',
      memberId: 'm-1',
      memberCode: 'M-000001',
      memberName: 'Lola Hayitova',
      checkedInAt: '2026-10-02T09:15:00.000Z',
      stillInside: true,
      method: 'QR',
      visitDeducted: false,
    },
    visitsRemaining: null,
    membershipDaysRemaining: 37,
    ...overrides,
  } as CheckInResult;
}

/** A refusal exactly as the backend sends it. */
function denial(reason: string) {
  return new ApiError(422, {
    error: 'UNPROCESSABLE_ENTITY',
    message: 'Entry refused',
    details: [{ field: 'memberId', messages: [reason] }],
  });
}

describe('CheckInResultPanel', () => {
  it('announces an admission loudly enough to read across a desk', async () => {
    await renderWithProviders(
      <CheckInResultPanel outcome={{ kind: 'admitted', result: admitted() }} onDismiss={() => {}} />,
    );

    const panel = screen.getByRole('status');
    expect(panel).toHaveTextContent('Admitted');
    expect(panel).toHaveTextContent('Lola Hayitova');
    // Colour alone must never carry the answer.
    expect(panel).toHaveAttribute('aria-live', 'assertive');
  });

  it('warns when the membership is nearly out of days', async () => {
    await renderWithProviders(
      <CheckInResultPanel
        outcome={{ kind: 'admitted', result: admitted({ membershipDaysRemaining: 3 }) }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText('This membership expires in 3 days')).toBeInTheDocument();
  });

  it('warns when visits are nearly used up', async () => {
    await renderWithProviders(
      <CheckInResultPanel
        outcome={{ kind: 'admitted', result: admitted({ visitsRemaining: 2, membershipDaysRemaining: 60 }) }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText('Only 2 visits left')).toBeInTheDocument();
  });

  it('stays quiet when there is nothing to warn about', async () => {
    await renderWithProviders(
      <CheckInResultPanel
        outcome={{ kind: 'admitted', result: admitted({ visitsRemaining: 40, membershipDaysRemaining: 300 }) }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.queryByText(/expires in/)).not.toBeInTheDocument();
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it('repeats the backend’s own reason for a refusal, translated', async () => {
    await renderWithProviders(
      <CheckInResultPanel outcome={{ kind: 'denied', error: denial('ALREADY_INSIDE') }} onDismiss={() => {}} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Not admitted');
    expect(screen.getByText('This member is already checked in')).toBeInTheDocument();
  });

  it('has a translation for every reason the backend can give', async () => {
    // The thirteen EntryDenialReason values, each rendered rather than
    // falling through to a raw code.
    for (const reason of ENTRY_DENIAL_REASONS) {
      const { unmount } = await renderWithProviders(
        <CheckInResultPanel outcome={{ kind: 'denied', error: denial(reason) }} onDismiss={() => {}} />,
      );
      const panel = screen.getByRole('status');
      expect(panel.textContent).not.toContain(reason);
      expect(panel.textContent).not.toContain('denial.');
      unmount();
    }
  });

  it('falls back to the server’s sentence for a reason it does not know', async () => {
    const error = new ApiError(422, {
      error: 'UNPROCESSABLE_ENTITY',
      message: 'Some new rule the frontend has not met yet',
      details: [{ messages: ['SOME_FUTURE_REASON'] }],
    });
    await renderWithProviders(
      <CheckInResultPanel outcome={{ kind: 'denied', error }} onDismiss={() => {}} />,
    );
    expect(screen.getByText('Some new rule the frontend has not met yet')).toBeInTheDocument();
  });

  it('names the member even when the door said no', async () => {
    await renderWithProviders(
      <CheckInResultPanel
        outcome={{ kind: 'denied', error: denial('MEMBERSHIP_FROZEN'), memberName: 'Aziz Tursunov' }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Aziz Tursunov');
  });

  it('translates a refusal into Russian', async () => {
    await renderWithProviders(
      <CheckInResultPanel outcome={{ kind: 'denied', error: denial('NO_VISITS_LEFT') }} onDismiss={() => {}} />,
      { locale: 'ru' },
    );
    expect(screen.getByText('Посещения по абонементу закончились')).toBeInTheDocument();
  });

  it('translates a refusal into Uzbek', async () => {
    await renderWithProviders(
      <CheckInResultPanel outcome={{ kind: 'denied', error: denial('CARD_REVOKED') }} onDismiss={() => {}} />,
      { locale: 'uz' },
    );
    expect(screen.getByText('Bu abonement kartasi bekor qilingan')).toBeInTheDocument();
  });

  it('renders nothing at all when there is no outcome', async () => {
    const { container } = await renderWithProviders(
      <CheckInResultPanel outcome={null} onDismiss={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
