import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { parseWith, requiredRm } from '../../common/http';
import { AnalysisService } from './analysis.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const analyzeBody = z
  .object({
    locale: z.enum(['vi', 'en']).default('vi'),
    // The window shown in the UI filter; omitted means the default 90-day window.
    periodFrom: isoDate.optional(),
    periodTo: isoDate.optional(),
  })
  .refine((value) => !value.periodFrom || !value.periodTo || value.periodFrom <= value.periodTo, {
    message: 'periodFrom must be on or before periodTo',
  });

@ApiTags('analysis')
@ApiHeader({ name: 'X-RM-ID', required: true })
@Controller('api')
export class AnalysisController {
  constructor(private readonly service: AnalysisService) {}
  @Post('customers/:id/analyze')
  analyze(@Param('id') id: string, @Headers('x-rm-id') rmId: string | undefined, @Body() body: unknown) {
    const input = parseWith(analyzeBody, body ?? {});
    return this.service.analyze(id, requiredRm(rmId), input);
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

