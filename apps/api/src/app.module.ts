import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from './database/entities';
import { databaseOptions } from './database/data-source';
import { RmsController } from './modules/rms/rms.controller';
import { RmsService } from './modules/rms/rms.service';
import { CustomersController } from './modules/customers/customers.controller';
import { CustomersService } from './modules/customers/customers.service';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { AnalysisController } from './modules/analysis/analysis.controller';
import { AnalysisService } from './modules/analysis/analysis.service';
import { RecommendationsController } from './modules/recommendations/recommendations.controller';
import { RecommendationsService } from './modules/recommendations/recommendations.service';
import { InternalController } from './modules/internal/internal.controller';
import { InternalAgentGuard } from './modules/internal/internal.guard';
import { HealthController } from './modules/health/health.controller';
import { MetricsController } from './modules/metrics/metrics.controller';
import { MetricsService } from './modules/metrics/metrics.service';
import { AGENT_CLIENT } from './modules/agent/agent.types';
import { MockAgentClient } from './modules/agent/mock-agent.client';
import { GreenNodeAgentClient } from './modules/agent/greennode-agent.client';

@Module({
  imports: [
    // Works from both the monorepo root and the apps/api directory.
    // Production platforms provide these values through their environment.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['apps/api/.env', '.env', '../../.env'] }),
    TypeOrmModule.forRoot(databaseOptions()),
    TypeOrmModule.forFeature(entities),
  ],
  controllers: [
    RmsController, CustomersController, DashboardController, AnalysisController,
    RecommendationsController, InternalController, HealthController, MetricsController,
  ],
  providers: [
    RmsService, CustomersService, DashboardService, AnalysisService, RecommendationsService, MetricsService,
    InternalAgentGuard, MockAgentClient, GreenNodeAgentClient,
    {
      provide: AGENT_CLIENT,
      inject: [MockAgentClient, GreenNodeAgentClient],
      useFactory: (mock: MockAgentClient, greenNode: GreenNodeAgentClient) =>
        (process.env.AGENT_PROVIDER ?? 'mock').toLowerCase() === 'greennode' ? greenNode : mock,
    },
  ],
})
export class AppModule {}
