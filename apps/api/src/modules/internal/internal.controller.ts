import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { dateRangeQuerySchema } from '@mlink/contracts';
import { z } from 'zod';
import { parseWith } from '../../common/http';
import { CustomersService } from '../customers/customers.service';
import { MetricsService } from '../metrics/metrics.service';
import { InternalAgentGuard } from './internal.guard';

const asOfQuerySchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  windowDays: z.coerce.number().int().min(7).max(365).optional(),
});

/** Read-only banking context for the external Agent. Same shapes as the public routes. */
@ApiTags('internal-agent')
@ApiBearerAuth('internal-agent-token')
@UseGuards(InternalAgentGuard)
@Controller('internal/customers')
export class InternalController {
  constructor(private readonly customers: CustomersService, private readonly metrics: MetricsService) {}
  @Get(':id') detail(@Param('id') id: string) {
    return this.customers.detail(id);
  }
  @Get(':id/accounts') accounts(@Param('id') id: string) {
    return this.customers.listAccounts(id);
  }
  @Get(':id/transactions') transactions(@Param('id') id: string, @Query() query: unknown) {
    return this.customers.listTransactions(id, undefined, query);
  }
  @Get(':id/cards') cards(@Param('id') id: string) {
    return this.customers.listCards(id);
  }
  @Get(':id/deposits') deposits(@Param('id') id: string) {
    return this.customers.listDeposits(id);
  }
  @Get(':id/interactions') interactions(@Param('id') id: string) {
    return this.customers.listInteractions(id);
  }
  @Get(':id/metrics') async metricsDetail(@Param('id') id: string, @Query() query: unknown) {
    await this.customers.assertCustomer(id);
    const { asOf, windowDays } = parseWith(asOfQuerySchema, query);
    return asOf || windowDays ? this.metrics.getAsOf(id, asOf, windowDays) : this.metrics.getLatest(id);
  }
  @Get(':id/period-summary') async periodSummary(@Param('id') id: string, @Query() query: unknown) {
    await this.customers.assertCustomer(id);
    return this.metrics.periodSummary(id, parseWith(dateRangeQuerySchema, query));
  }
  @Get(':id/holdings') async holdings(@Param('id') id: string) {
    await this.customers.assertCustomer(id);
    return this.metrics.listHoldings(id);
  }
  @Get(':id/next-best-offers') async offers(@Param('id') id: string) {
    await this.customers.assertCustomer(id);
    return this.metrics.listNextBestOffers(id);
  }
  @Get(':id/positions') async positions(@Param('id') id: string, @Query() query: unknown) {
    await this.customers.assertCustomer(id);
    const range = parseWith(dateRangeQuerySchema, query);
    return this.metrics.listPositionsInRange(id, range.from || range.to ? range : { days: 365 });
  }
}
