import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/test/next-mocks';
import { routerMock } from '@/test/next-mocks';
import { renderWithProviders } from '@/test/render';
import type * as ApiClient from '@/lib/api/client';
import { LoginForm } from '@/app/(auth)/login/LoginForm';

const loginRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  loginRequest,
}));

const { ApiError } = await import('@/lib/api/errors');

function fillIn() {
  return {
    email: screen.getByLabelText(/email/i),
    password: screen.getByLabelText(/^password/i),
    submit: screen.getByRole('button', { name: /sign in/i }),
  };
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no searchParams by default; the mock returns an empty set.
  });

  it('refuses to submit an empty form and says why, per field', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LoginForm />, { user: null });

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Both fields are empty, so both report the same thing: an empty email
    // is missing, not malformed.
    expect(await screen.findAllByText('This field is required')).toHaveLength(2);
    expect(loginRequest).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before calling the API', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LoginForm />, { user: null });

    const form = fillIn();
    await user.type(form.email, 'not-an-email');
    await user.type(form.password, 'ChangeMe123!');
    await user.click(form.submit);

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(loginRequest).not.toHaveBeenCalled();
  });

  it('signs in and resumes where the visitor was headed', async () => {
    const user = userEvent.setup();
    loginRequest.mockResolvedValue({ user: { id: '1' } });
    await renderWithProviders(<LoginForm />, { user: null });

    const form = fillIn();
    await user.type(form.email, 'olivia@gym.local');
    await user.type(form.password, 'ChangeMe123!');
    await user.click(form.submit);

    await waitFor(() => expect(loginRequest).toHaveBeenCalledWith('olivia@gym.local', 'ChangeMe123!'));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/'));
  });

  it('tells a wrong password apart from a disabled account', async () => {
    const user = userEvent.setup();
    loginRequest.mockRejectedValue(new ApiError(401, { error: 'UNAUTHORIZED', message: 'x' }));
    await renderWithProviders(<LoginForm />, { user: null });

    const form = fillIn();
    await user.type(form.email, 'olivia@gym.local');
    await user.type(form.password, 'wrong-password');
    await user.click(form.submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('explains a disabled account instead of blaming the password', async () => {
    const user = userEvent.setup();
    // The backend answers 403 for an account that exists with the right
    // password but is not active. Saying "wrong password" would send the
    // member round in circles.
    loginRequest.mockRejectedValue(new ApiError(403, { error: 'FORBIDDEN', message: 'x' }));
    await renderWithProviders(<LoginForm />, { user: null });

    const form = fillIn();
    await user.type(form.email, 'archived@gym.local');
    await user.type(form.password, 'CorrectHorse1');
    await user.click(form.submit);

    expect(await screen.findByRole('alert')).toHaveTextContent(/not active/i);
  });

  it('asks the visitor to wait when the rate limiter trips', async () => {
    const user = userEvent.setup();
    loginRequest.mockRejectedValue(new ApiError(429, { error: 'RATE_LIMIT_EXCEEDED', message: 'x' }));
    await renderWithProviders(<LoginForm />, { user: null });

    const form = fillIn();
    await user.type(form.email, 'olivia@gym.local');
    await user.type(form.password, 'ChangeMe123!');
    await user.click(form.submit);

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many sign-in attempts/i);
  });

  it('clears the password after a failure so a retry starts clean', async () => {
    const user = userEvent.setup();
    loginRequest.mockRejectedValue(new ApiError(401, { error: 'UNAUTHORIZED', message: 'x' }));
    await renderWithProviders(<LoginForm />, { user: null });

    const form = fillIn();
    await user.type(form.email, 'olivia@gym.local');
    await user.type(form.password, 'wrong-password');
    await user.click(form.submit);

    await screen.findByRole('alert');
    expect(form.password).toHaveValue('');
    expect(form.email).toHaveValue('olivia@gym.local');
  });

  it('is fully translated in Russian', async () => {
    await renderWithProviders(<LoginForm />, { user: null, locale: 'ru' });
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.getByText('Забыли пароль?')).toBeInTheDocument();
  });

  it('is fully translated in Uzbek', async () => {
    await renderWithProviders(<LoginForm />, { user: null, locale: 'uz' });
    expect(screen.getByRole('heading', { name: 'Tizimga kirish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kirish' })).toBeInTheDocument();
  });

  it('shows validation messages in the reader’s language', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LoginForm />, { user: null, locale: 'ru' });

    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findAllByText('Это поле обязательно')).toHaveLength(2);
  });

  it('lets the password be revealed and hidden again', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LoginForm />, { user: null });

    const password = screen.getByLabelText(/^password/i);
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password).toHaveAttribute('type', 'password');
  });
});
