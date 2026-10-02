import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import '@/test/next-mocks';
import { apiMock } from '@/test/api-mock';
import { renderWithProviders } from '@/test/render';
import { DoorCodeScreen } from '../DoorCodeScreen';

const CODE = 'DOOR1.59697422.32dfb3c1a9e84f7b2d6c0a5e8f1b4d7c';

function doorCode(secondsLeft = 30) {
  return {
    code: CODE,
    periodSeconds: 30,
    expiresAt: new Date(Date.now() + secondsLeft * 1000).toISOString(),
  };
}

describe('DoorCodeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue(doorCode());
  });
  afterEach(() => vi.useRealTimers());

  it('renders the code as a scannable QR', async () => {
    const { container } = await renderWithProviders(<DoorCodeScreen />);
    await screen.findByText('Open the app and scan to check in');

    // The QR is the one svg whose viewBox is a square module grid; the others
    // on the page are 24x24 icons.
    const qr = Array.from(container.querySelectorAll('svg')).find((svg) => {
      const box = svg.getAttribute('viewBox')?.split(' ') ?? [];
      return box.length === 4 && box[2] === box[3] && Number(box[2]) > 24;
    });
    expect(qr).toBeDefined();
    expect(qr!.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('never caches the code — a stale one is a refused member', async () => {
    await renderWithProviders(<DoorCodeScreen />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('attendance/door-code'));
  });

  it('tells the room how often it changes', async () => {
    await renderWithProviders(<DoorCodeScreen />);
    expect(await screen.findByText(/Changes every 30 seconds/)).toBeInTheDocument();
  });

  it('warns that a photograph of it stops working', async () => {
    // This is the whole reason the design rotates; it should be said on screen.
    await renderWithProviders(<DoorCodeScreen />);
    expect(
      await screen.findByText('A photograph of this code stops working within a minute.'),
    ).toBeInTheDocument();
  });

  it('fetches the next code once the current one expires', async () => {
    apiMock.get.mockResolvedValue(doorCode(0.2));
    await renderWithProviders(<DoorCodeScreen />);

    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(1));
    // The screen must refresh itself; nobody is standing there to press a button.
    await waitFor(() => expect(apiMock.get.mock.calls.length).toBeGreaterThan(1), { timeout: 3000 });
  });

  it('offers a retry rather than a blank screen when it cannot load', async () => {
    apiMock.get.mockRejectedValue(new Error('boom'));
    await renderWithProviders(<DoorCodeScreen />);
    expect(await screen.findByText('The entry code could not be loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders in Russian', async () => {
    await renderWithProviders(<DoorCodeScreen />, { locale: 'ru' });
    expect(
      await screen.findByText('Откройте приложение и отсканируйте, чтобы отметить приход'),
    ).toBeInTheDocument();
  });

  it('renders in Uzbek', async () => {
    await renderWithProviders(<DoorCodeScreen />, { locale: 'uz' });
    expect(
      await screen.findByText("Ilovani oching va kirishni qayd etish uchun skanerlang"),
    ).toBeInTheDocument();
  });
});
