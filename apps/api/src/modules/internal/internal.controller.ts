import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomersService } from '../customers/customers.service';
import { InternalAgentGuard } from './internal.guard';

@ApiTags('internal-agent')
@ApiBearerAuth('internal-agent-token')
@UseGuards(InternalAgentGuard)
@Controller('internal/customers')
export class InternalController {
  constructor(private readonly customers: CustomersService) {}
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
}

