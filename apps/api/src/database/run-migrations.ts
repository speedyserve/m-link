import { AppDataSource } from './data-source';

async function run() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  await AppDataSource.destroy();
}

run().catch((error: unknown) => {
  console.error('Migration failed', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
