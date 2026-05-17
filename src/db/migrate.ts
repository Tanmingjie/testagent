import { execSync } from 'child_process';
import { resolve } from 'path';

async function main() {
  console.log('Running database migrations...');

  const drizzleKitBin = resolve(
    import.meta.dirname,
    '../../node_modules/.bin/drizzle-kit',
  );

  execSync(`${drizzleKitBin} push --force`, {
    cwd: resolve(import.meta.dirname, '../..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      DB_PATH: process.env.DB_PATH || './data/testagent.db',
    },
  });

  console.log('Migrations complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
