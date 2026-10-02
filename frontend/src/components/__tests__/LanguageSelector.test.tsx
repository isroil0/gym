import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/test/next-mocks';
import { routerMock } from '@/test/next-mocks';
import { renderWithProviders } from '@/test/render';
import { LanguageSelector } from '@/components/layout/LanguageSelector';
import { LOCALE_COOKIE } from '@/i18n/config';

describe('LanguageSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
  });

  it('offers all three languages, each written in itself', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LanguageSelector />);

    await user.click(screen.getByRole('button', { name: /change language/i }));

    expect(await screen.findByRole('menuitemradio', { name: "O'zbekcha" })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Русский' })).toBeInTheDocument();
  });

  it('persists the choice so it survives a reload', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LanguageSelector />);

    await user.click(screen.getByRole('button', { name: /change language/i }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Русский' }));

    await waitFor(() => expect(document.cookie).toContain(`${LOCALE_COOKIE}=ru`));
  });

  it('refreshes in place instead of navigating, so the page is not lost', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LanguageSelector />);

    await user.click(screen.getByRole('button', { name: /change language/i }));
    await user.click(await screen.findByRole('menuitemradio', { name: "O'zbekcha" }));

    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    // A push or replace would discard scroll position, open dialogs and any
    // half-filled form on the page.
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('does nothing when the current language is chosen again', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LanguageSelector />, { locale: 'en' });

    await user.click(screen.getByRole('button', { name: /change language/i }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'English' }));

    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('marks the active language for assistive technology', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LanguageSelector />, { locale: 'ru' });

    await user.click(screen.getByRole('button', { name: /сменить язык/i }));
    const active = await screen.findByRole('menuitemradio', { name: 'Русский' });
    expect(active).toBeChecked();

    const inactive = screen.getByRole('menuitemradio', { name: 'English' });
    expect(inactive).not.toBeChecked();
  });
});
