import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RmsService } from './rms.service';

@ApiTags('rms')
@Controller('api/rms')
export class RmsController {
  constructor(private readonly service: RmsService) {}
  @Get() list() {
    return this.service.list();
  }
}

