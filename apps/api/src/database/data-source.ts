import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { entities } from './entities';
import { InitialSchema1726200000000 } from './migrations/1726200000000-InitialSchema';
import { MsbCustomerModel1758153600000 } from './migrations/1758153600000-MsbCustomerModel';
import { CustomerLoans1758700000000 } from './migrations/1758700000000-CustomerLoans';

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
    migrations: [InitialSchema1726200000000, MsbCustomerModel1758153600000, CustomerLoans1758700000000],
    synchronize: false,
    logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  };
}

export const AppDataSource = new DataSource(databaseOptions());
