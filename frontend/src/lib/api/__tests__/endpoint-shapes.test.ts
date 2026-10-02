import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The generated types describe each DTO's fields, but nothing stops a call
 * site from naming the wrong DTO: `api.get<Paginated<X>>(...)` compiles even
 * when the endpoint answers with something else entirely. That mistake shipped
 * once — `/memberships/me` returns `{ current, history }`, not a page — and
 * rendered an empty screen for every member.
 *
 * This reads the OpenAPI document and asserts what each "own records"
 * endpoint actually returns, so the next change of shape is caught here
 * rather than by a member staring at a blank page.
 */
const spec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'openapi.json'), 'utf8'),
) as {
  paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }> }>>;
};

function responseSchema(path: string): string {
  const get = spec.paths[`/api/v1/${path}`]?.get;
  const ref = get?.responses?.['200']?.content?.['application/json']?.schema?.$ref;
  return ref ? ref.split('/').pop()! : 'unknown';
}

describe('own-records endpoint shapes', () => {
  it('memberships/me is not a page', () => {
    // It carries the current term plus history, already separated.
    expect(responseSchema('memberships/me')).toBe('OwnMembershipsDto');
  });

  it.each([
    ['workout-plans/me', 'PaginatedWorkoutPlansDto'],
    ['payments/me', 'PaginatedPaymentsDto'],
    ['attendance/me', 'PaginatedAttendanceDto'],
    ['training-sessions/me', 'PaginatedTrainingSessionsDto'],
    ['measurements/me', 'PaginatedMeasurementsDto'],
  ])('%s is a page of %s', (path, expected) => {
    expect(responseSchema(path)).toBe(expected);
  });

  it.each([
    ['dashboard/member', 'MemberDashboardDto'],
    ['dashboard/trainer', 'TrainerDashboardDto'],
    ['dashboard/admin', 'AdminDashboardDto'],
    ['billing/me', 'MemberBillingDto'],
    ['membership-cards/me', 'MembershipCardResponseDto'],
    ['measurements/progress/me', 'MemberProgressDto'],
  ])('%s returns %s', (path, expected) => {
    expect(responseSchema(path)).toBe(expected);
  });
});
