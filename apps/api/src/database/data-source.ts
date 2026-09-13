import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { entities } from './entities';
import { InitialSchema1726200000000 } from './migrations/1726200000000-InitialSchema';

config({ path: join(process.cwd(), 'apps/api/.env') });
config({ path: join(process.cwd(), '.env'), override: false });
config({ path: join(process.cwd(), '../../.env'), override: false });

export function databaseOptions(): DataSourceOptions {
  const ssl = process.env.DATABASE_SSL === 'true';
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgresql://mlink:mlink@localhost:5432/mlink',
    ssl: ssl ? { rejectUnauthorized: false } : false,
    entities,
    migrations: [InitialSchema1726200000000],
    synchronize: false,
    logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  };
}

export const AppDataSource = new DataSource(databaseOptions());
