import { actionGroupFor } from './dashboard.service';

describe('actionGroupFor', () => {
  it('splits every customer into exactly RETENTION or OPPORTUNITY, by churn risk alone', () => {
    expect(actionGroupFor({ churnLabel: 'Cao' })).toBe('RETENTION');
    expect(actionGroupFor({ churnLabel: 'Thấp' })).toBe('OPPORTUNITY');
    // "Chăm sóc" (sellAllowed) is intentionally not a parameter here — it is an
    // independent flag that can apply to a customer from either group.
  });
});
