import { AppDataSource } from './data-source';
import { seedDatabase } from './seed';

/** `db:reset` is an alias of `db:seed` now that the seed always truncates; kept for the documented scripts. */
async function reset() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Database reset is disabled in production');
  }
  await seedDatabase();
  await AppDataSource.destroy();
  console.log('Demo database reset completed');
}

reset().catch(async (error: unknown) => {
  console.error('Reset failed', error instanceof Error ? error.message : 'Unknown error');
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exitCode = 1;
});
