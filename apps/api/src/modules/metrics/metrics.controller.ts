import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { dateRangeQuerySchema } from '@mlink/contracts';
import { z } from 'zod';
import { parseWith, requiredRm } from '../../common/http';
import { CustomersService } from '../customers/customers.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { MetricsService } from './metrics.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const positionsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(), from: isoDate.optional(), to: isoDate.optional(),
});
const asOfQuerySchema = z.object({
  asOf: isoDate.optional(),
  windowDays: z.coerce.number().int().min(7).max(365).optional(),
});

@ApiTags('metrics')
@ApiHeader({ name: 'X-RM-ID', required: true })
@Controller('api')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly customers: CustomersService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get('metrics/queue') queue(@Headers('x-rm-id') rmId?: string) {
    return this.dashboard.queue(requiredRm(rmId));
  }
  @Get('customers/:id/metrics') async detail(@Param('id') id: string, @Headers('x-rm-id') rmId: string | undefined, @Query() query: unknown) {
    await this.customers.assertCustomer(id, requiredRm(rmId));
    const { asOf, windowDays } = parseWith(asOfQuerySchema, query);
    return asOf || windowDays ? this.metrics.getAsOf(id, asOf, windowDays) : this.metrics.getLatest(id);
  }
  @Get('customers/:id/period-summary') async periodSummary(@Param('id') id: string, @Headers('x-rm-id') rmId: string | undefined, @Query() query: unknown) {
    await this.customers.assertCustomer(id, requiredRm(rmId));
    return this.metrics.periodSummary(id, parseWith(dateRangeQuerySchema, query));
  }
  @Get('customers/:id/data-range') async dataRange(@Param('id') id: string, @Headers('x-rm-id') rmId?: string) {
    await this.customers.assertCustomer(id, requiredRm(rmId));
    return this.metrics.dataRange(id);
  }
  @Get('customers/:id/holdings') async holdings(@Param('id') id: string, @Headers('x-rm-id') rmId?: string) {
    await this.customers.assertCustomer(id, requiredRm(rmId));
    return this.metrics.listHoldings(id);
  }
  @Get('customers/:id/next-best-offers') async offers(@Param('id') id: string, @Headers('x-rm-id') rmId?: string) {
    await this.customers.assertCustomer(id, requiredRm(rmId));
    return this.metrics.listNextBestOffers(id);
  }
  @Get('customers/:id/positions') async positions(@Param('id') id: string, @Headers('x-rm-id') rmId: string | undefined, @Query() query: unknown) {
    await this.customers.assertCustomer(id, requiredRm(rmId));
    return this.metrics.listPositionsInRange(id, parseWith(positionsQuerySchema, query));
  }
  @Get('customers/:id/monthly-averages') async monthly(@Param('id') id: string, @Headers('x-rm-id') rmId: string | undefined, @Query() query: unknown) {
    await this.customers.assertCustomer(id, requiredRm(rmId));
    return this.metrics.monthlyAverages(id, parseWith(dateRangeQuerySchema, query));
  }
}
