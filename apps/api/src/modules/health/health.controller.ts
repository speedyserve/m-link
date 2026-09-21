import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainException } from '../../common/http';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}
  @Get() live() {
    return { status: 'ok', service: 'mlink-api' };
  }
  @Get('ready')
  async ready() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ready', database: 'up' };
    } catch {
      throw new DomainException(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable.');
    }
  }
}

