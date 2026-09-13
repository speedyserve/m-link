import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { requiredRm } from '../../common/http';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiHeader({ name: 'X-RM-ID', required: true })
@Controller('api/recommendations')
export class RecommendationsController {
  constructor(private readonly service: RecommendationsService) {}
  @Post(':id/feedback')
  save(@Param('id') id: string, @Headers('x-rm-id') rmId: string | undefined, @Body() body: unknown) {
    return this.service.saveFeedback(id, requiredRm(rmId), body);
  }
}
