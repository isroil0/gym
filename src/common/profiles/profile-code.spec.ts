import { formatProfileCode, memberCode, trainerCode } from './profile-code';

describe('profile codes', () => {
  it.each([
    [1, 'M-000001'],
    [42, 'M-000042'],
    [999999, 'M-999999'],
  ])('pads member number %i to %s', (input, expected) => {
    expect(memberCode(input)).toBe(expected);
  });

  it('uses a T prefix for trainers', () => {
    expect(trainerCode(7)).toBe('T-000007');
  });

  it('does not truncate a number beyond the padding width', () => {
    expect(formatProfileCode('M', 1234567)).toBe('M-1234567');
  });
});
