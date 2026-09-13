import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { parseWith, requiredRm } from '../../common/http';
import { AnalysisService } from './analysis.service';

const analyzeBody = z.object({ locale: z.enum(['vi', 'en']).default('vi') });

@ApiTags('analysis')
@ApiHeader({ name: 'X-RM-ID', required: true })
@Controller('api')
export class AnalysisController {
  constructor(private readonly service: AnalysisService) {}
  @Post('customers/:id/analyze')
  analyze(@Param('id') id: string, @Headers('x-rm-id') rmId: string | undefined, @Body() body: unknown) {
    const input = parseWith(analyzeBody, body ?? {});
    return this.service.analyze(id, requiredRm(rmId), input.locale);
  }
  @Get('customers/:id/analyses')
  list(@Param('id') id: string, @Headers('x-rm-id') rmId?: string) {
    return this.service.list(id, requiredRm(rmId));
  }
  @Get('analyses/:id')
  detail(@Param('id') id: string, @Headers('x-rm-id') rmId?: string) {
    return this.service.getById(id, requiredRm(rmId));
  }
}

