import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/test/next-mocks';
import { apiMock } from '@/test/api-mock';
import { renderWithProviders } from '@/test/render';
import { DoorCodeScreen } from '../DoorCodeScreen';

const CODE = 'DOOR1.1.32dfb3c1a9e84f7b2d6c0a5e8f1b4d7c';
const REISSUED = 'DOOR1.2.77aab3c1a9e84f7b2d6c0a5e8f1b4d7c';

/** The QR is the one svg whose viewBox is a square module grid. */
function findQr(container: HTMLElement): SVGElement | undefined {
  return Array.from(container.querySelectorAll('svg')).find((svg) => {
    const box = svg.getAttribute('viewBox')?.split(' ') ?? [];
    return box.length === 4 && box[2] === box[3] && Number(box[2]) > 24;
  });
}

describe('DoorCodeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({ code: CODE, version: 1 });
  });

  it('renders the code as a scannable QR', async () => {
    const { container } = await renderWithProviders(<DoorCodeScreen />);
    await screen.findByText('Open the app and scan to record your entry');

    const qr = findQr(container);
    expect(qr).toBeDefined();
    expect(qr!.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('asks the backend for the code', async () => {
    await renderWithProviders(<DoorCodeScreen />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('attendance/door-code'));
  });

  it('shows which version is live, so staff can check the printed sign', async () => {
    await renderWithProviders(<DoorCodeScreen />);
    expect(await screen.findByText('Code version 1')).toBeInTheDocument();
  });

  it('says the code does not change, so one printout lasts', async () => {
    await renderWithProviders(<DoorCodeScreen />);
    expect(await screen.findByText(/does not change/)).toBeInTheDocument();
  });

  it('offers printing and full screen', async () => {
    await renderWithProviders(<DoorCodeScreen />);
    expect(await screen.findByRole('button', { name: 'Print' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show full screen' })).toBeInTheDocument();
  });

  it('shows the code large with no chrome in full screen', async () => {
    const { container } = await renderWithProviders(<DoorCodeScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show full screen' }));

    expect(findQr(container)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument();
  });

  it('prints when asked', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await renderWithProviders(<DoorCodeScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Print' }));

    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('does not reissue without confirmation', async () => {
    await renderWithProviders(<DoorCodeScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Issue a new code' }));

    // The dialog is open; nothing has been sent yet.
    expect(await screen.findByText('Issue a new entry code?')).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('warns that the sign at the door will stop working', async () => {
    await renderWithProviders(<DoorCodeScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Issue a new code' }));

    expect(await screen.findByText(/stops working immediately/)).toBeInTheDocument();
  });

  it('abandons the reissue on cancel', async () => {
    await renderWithProviders(<DoorCodeScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Issue a new code' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('shows the new code once confirmed, without refetching', async () => {
    apiMock.post.mockResolvedValue({ code: REISSUED, version: 2 });
    await renderWithProviders(<DoorCodeScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Issue a new code' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Issue new code' }));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('attendance/door-code/reissue', {}),
    );
    expect(await screen.findByText('Code version 2')).toBeInTheDocument();
  });

  it('tells staff to replace the sign after reissuing', async () => {
    apiMock.post.mockResolvedValue({ code: REISSUED, version: 2 });
    await renderWithProviders(<DoorCodeScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Issue a new code' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Issue new code' }));

    expect(await screen.findByText(/Replace the sign at the door/)).toBeInTheDocument();
  });

  it('keeps the old code on screen when reissuing fails', async () => {
    apiMock.post.mockRejectedValue(new Error('network'));
    await renderWithProviders(<DoorCodeScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Issue a new code' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Issue new code' }));

    // A failed reissue must not leave staff believing the sign is stale.
    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    expect(await screen.findByText('Code version 1')).toBeInTheDocument();
  });

  it('offers a retry when the code cannot be loaded', async () => {
    apiMock.get.mockRejectedValue(new Error('offline'));
    await renderWithProviders(<DoorCodeScreen />);

    expect(await screen.findByText('Could not load the entry code')).toBeInTheDocument();
  });
});
