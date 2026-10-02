import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import '@/test/next-mocks';
import { apiMock } from '@/test/api-mock';
import { renderWithProviders } from '@/test/render';
import { WorkoutPlanEditor } from '../WorkoutPlanEditor';

const PLAN = {
  id: 'wp-1',
  memberId: 'm-1',
  memberName: 'Aziz Tursunov',
  trainerId: 't-1',
  name: '12-week strength block',
  goal: 'Add 10 kg to the squat',
  status: 'ACTIVE',
  dayCount: 2,
  exerciseCount: 3,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  days: [
    {
      id: 'd-1',
      dayOrder: 1,
      name: 'Push',
      exercises: [
        { id: 'e-1', exerciseOrder: 1, name: 'Bench press', sets: 4, reps: '8-10', weight: 70, weightUnit: 'KG', restSeconds: 90 },
        { id: 'e-2', exerciseOrder: 2, name: 'Overhead press', sets: 3, reps: '8-12' },
      ],
    },
    { id: 'd-2', dayOrder: 2, name: 'Legs', exercises: [] },
  ],
};

describe('WorkoutPlanEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue(PLAN);
  });

  it('shows the programme the backend returned', async () => {
    await renderWithProviders(<WorkoutPlanEditor planId="wp-1" />);

    expect(await screen.findByRole('heading', { name: '12-week strength block' })).toBeInTheDocument();
    expect(screen.getByText('Push')).toBeInTheDocument();
    expect(screen.getByText('Legs')).toBeInTheDocument();
    expect(screen.getByText('Bench press')).toBeInTheDocument();
  });

  it('shows sets, reps and weight together when a weight is set', async () => {
    await renderWithProviders(<WorkoutPlanEditor planId="wp-1" />);
    expect(await screen.findByText(/4 × 8-10 @ 70 kg/)).toBeInTheDocument();
  });

  it('omits the weight when none was given rather than printing a zero', async () => {
    await renderWithProviders(<WorkoutPlanEditor planId="wp-1" />);
    const line = await screen.findByText(/3 × 8-12/);
    expect(line.textContent).not.toMatch(/@/);
    expect(line.textContent).not.toMatch(/0 kg/);
  });

  it('invites the trainer to fill an empty day', async () => {
    await renderWithProviders(<WorkoutPlanEditor planId="wp-1" />);
    expect(await screen.findByText('No exercises on this day')).toBeInTheDocument();
  });

  it('offers editing controls to the trainer who owns it', async () => {
    await renderWithProviders(<WorkoutPlanEditor planId="wp-1" />);
    expect(await screen.findAllByRole('button', { name: 'Add exercise' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('offers no editing at all in read-only mode', async () => {
    // This is what a member sees. The backend would refuse the writes anyway;
    // showing the buttons would just be a lie.
    await renderWithProviders(<WorkoutPlanEditor planId="wp-1" readOnly />);

    await screen.findByText('Push');
    expect(screen.queryByRole('button', { name: 'Add exercise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a day' })).not.toBeInTheDocument();
  });

  it('stops offering edits once the plan is archived', async () => {
    apiMock.get.mockResolvedValue({ ...PLAN, status: 'ARCHIVED' });
    await renderWithProviders(<WorkoutPlanEditor planId="wp-1" />);

    await screen.findByText('Push');
    expect(screen.queryByRole('button', { name: 'Add exercise' })).not.toBeInTheDocument();
    // Reactivating is still offered: that is how it comes back.
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
  });

  it('copes with a plan whose days have not been loaded', async () => {
    apiMock.get.mockResolvedValue({ ...PLAN, days: undefined, dayCount: 0, exerciseCount: 0 });
    await renderWithProviders(<WorkoutPlanEditor planId="wp-1" />);
    expect(await screen.findByText('No training days yet')).toBeInTheDocument();
  });

  it('renders in Russian', async () => {
    await renderWithProviders(<WorkoutPlanEditor planId="wp-1" />, { locale: 'ru' });
    expect(await screen.findByText('В этом дне нет упражнений')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'В архив' })).toBeInTheDocument();
  });

  it('renders in Uzbek', async () => {
    await renderWithProviders(<WorkoutPlanEditor planId="wp-1" />, { locale: 'uz' });
    expect(await screen.findByText("Bu kunda mashqlar yo'q")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arxivlash' })).toBeInTheDocument();
  });
});
