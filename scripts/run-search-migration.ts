#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables
try {
  const envPath = join(process.cwd(), '.env');
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      const cleanValue = value.replace(/^["']|["']$/g, '');
      process.env[key.trim()] = cleanValue;
    }
  });
} catch (error) {
  console.log('Note: Could not load .env file');
}

async function runMigration() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('🚀 Running search fields migration...\n');

  try {
    // Read migration file
    const migrationPath = join(process.cwd(), 'migrations', '005_add_search_fields.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      
      const { error } = await supabase.rpc('exec_sql', {
        sql: statement + ';'
      });

      if (error) {
        console.error(`❌ Error: ${error.message}`);
        if (!error.message.includes('already exists')) {
          throw error;
        }
        console.log('  ⚠️ Ignoring "already exists" error');
      } else {
        console.log('  ✅ Success');
      }
    }

    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Note: This approach might not work as Supabase doesn't have a direct exec_sql RPC by default
// You may need to run the migration manually in the Supabase SQL editor
console.log('⚠️  Note: Supabase does not support direct SQL execution via API.');
console.log('📝 Please run the migration manually:');
console.log('   1. Go to your Supabase dashboard');
console.log('   2. Navigate to the SQL editor');
console.log('   3. Copy and paste the contents of migrations/005_add_search_fields.sql');
console.log('   4. Execute the SQL');
console.log('\nAlternatively, the migration may have already been run.');

// runMigration();