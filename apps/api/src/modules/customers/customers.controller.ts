import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { requiredRm } from '../../common/http';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiHeader({ name: 'X-RM-ID', required: true })
@Controller('api/customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}
  @Get() list(@Headers('x-rm-id') rmId: string | undefined, @Query() query: unknown) {
    return this.service.list(requiredRm(rmId), query);
  }
  @Get(':id') detail(@Param('id') id: string, @Headers('x-rm-id') rmId?: string) {
    return this.service.detail(id, requiredRm(rmId));
  }
  @Get(':id/accounts') accounts(@Param('id') id: string, @Headers('x-rm-id') rmId?: string) {
    return this.service.listAccounts(id, requiredRm(rmId));
  }
  @Get(':id/transactions') transactions(@Param('id') id: string, @Headers('x-rm-id') rmId: string | undefined, @Query() query: unknown) {
    return this.service.listTransactions(id, requiredRm(rmId), query);
  }
  @Get(':id/cards') cards(@Param('id') id: string, @Headers('x-rm-id') rmId?: string) {
    return this.service.listCards(id, requiredRm(rmId));
  }
  @Get(':id/deposits') deposits(@Param('id') id: string, @Headers('x-rm-id') rmId?: string) {
    return this.service.listDeposits(id, requiredRm(rmId));
  }
  @Get(':id/interactions') interactions(@Param('id') id: string, @Headers('x-rm-id') rmId?: string) {
    return this.service.listInteractions(id, requiredRm(rmId));
  }
}

