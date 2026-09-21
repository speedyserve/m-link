import { Controller, Get, Headers } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { requiredRm } from '../../common/http';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiHeader({ name: 'X-RM-ID', required: true })
@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}
  @Get() get(@Headers('x-rm-id') rmId?: string) {
    return this.service.get(requiredRm(rmId));
  }
}
