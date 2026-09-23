import { CustomersService } from './customers.service';
import type { Customer } from '../../database/entities';
import type { MetricsService } from '../metrics/metrics.service';
import type { RmsService } from '../rms/rms.service';

describe('CustomersService', () => {
  it('attaches latest metrics to list rows so churn badges match customer detail', async () => {
    const customer = {
      id: '08105069',
      customerCode: '08105069',
      fullName: 'Mai Anh Đức',
      rmId: 'RM001',
      churnWarning: true,
    } as Customer;
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[customer], 1]),
    };
    const customers = { createQueryBuilder: jest.fn(() => builder) };
    const metrics = {
      latestByCustomerIds: jest.fn().mockResolvedValue(new Map([
        ['08105069', { customerId: '08105069', churnLabel: 'Thấp', churnScore: 0 }],
      ])),
    } as unknown as MetricsService;
    const service = new CustomersService(
      customers as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { assertExists: jest.fn() } as unknown as RmsService,
      metrics,
    );

    const result = await service.list('RM001', { search: '0922 350 697' });

    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("regexp_replace(customer.phone"),
      { search: '%0922 350 697%', phoneSearch: '%0922350697%' },
    );
    expect(metrics.latestByCustomerIds).toHaveBeenCalledWith(['08105069']);
    expect(result.items[0]).toMatchObject({
      id: '08105069',
      churnWarning: true,
      metrics: { churnLabel: 'Thấp', churnScore: 0 },
    });
  });
});
