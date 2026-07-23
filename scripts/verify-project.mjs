import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  '.env.example',
  '.github/workflows/ci.yml',
  'package.json',
  'index.html',
  'vercel.json',
  'src/main.tsx',
  'src/app.tsx',
  'src/components/recording-station.tsx',
  'src/providers/upload-provider.tsx',
  'src/lib/tus-upload.ts',
  'api/setup.ts',
  'api/users.ts',
  'api/videos/delete.ts',
  'supabase/setup.sql',
  'docs/GITHUB.md',
];

const missing = requiredFiles.filter((file) => !existsSync(join(root, file)));
if (missing.length > 0) {
  console.error('File wajib tidak ditemukan:');
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

for (const obsoleteFile of ['main.tsx', 'robot.txt', 'package-lock.json']) {
  if (existsSync(join(root, obsoleteFile))) {
    console.error(`File lama harus dihapus atau dibuat ulang: ${obsoleteFile}`);
    process.exit(1);
  }
}

const sourceExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.sql',
  '.md',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.svg',
  '.txt',
  '.example',
]);
const files = [];
const generatedDocumentation = new Set([
  'DELETED_FILES.md',
  'VERIFICATION_REPORT.md',
  'PROJECT_FILE_TREE.txt',
  'SOURCE_MANIFEST.sha256',
]);
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    if (['node_modules', 'dist', '.git'].includes(name) || generatedDocumentation.has(name)) continue;
    const absolute = join(directory, name);
    const stats = statSync(absolute);
    if (stats.isDirectory()) walk(absolute);
    else if (sourceExtensions.has(extname(name)) || name === '.gitignore') files.push(absolute);
  }
};
walk(root);

const forbiddenPatterns = [
  {
    pattern: /GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|drive_file_id|Google Drive API/gi,
    label: 'sisa integrasi Google Drive',
  },
  {
    pattern: /VITE_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY/g,
    label: 'nama API key Supabase lama',
  },
  {
    pattern: /\/\/ existing code|\/\* existing code \*\/|TODO: implement|lanjutkan kode sebelumnya/gi,
    label: 'placeholder kode',
  },
];

let failed = false;
for (const file of files) {
  const path = relative(root, file).replaceAll('\\', '/');
  const content = readFileSync(file, 'utf8');
  if (path === 'scripts/verify-project.mjs') continue;
  for (const { pattern, label } of forbiddenPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      console.error(`${path}: ditemukan ${label}`);
      failed = true;
    }
  }
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const requiredPackage of [
  '@supabase/supabase-js',
  '@zxing/browser',
  'react',
  'react-dom',
  'react-router-dom',
  'tus-js-client',
  'zod',
]) {
  if (!packageJson.dependencies?.[requiredPackage]) {
    console.error(`package.json: dependency wajib tidak ditemukan: ${requiredPackage}`);
    failed = true;
  }
}
for (const forbiddenPackage of ['xlsx', 'googleapis', 'ffmpeg-static']) {
  if (packageJson.dependencies?.[forbiddenPackage] || packageJson.devDependencies?.[forbiddenPackage]) {
    console.error(`package.json: dependency lama tidak boleh digunakan: ${forbiddenPackage}`);
    failed = true;
  }
}

const envExample = readFileSync(join(root, '.env.example'), 'utf8');
for (const requiredEnv of [
  'VITE_SUPABASE_URL=',
  'VITE_SUPABASE_PUBLISHABLE_KEY=',
  'SUPABASE_SECRET_KEY=',
  'SETUP_SECRET=',
]) {
  if (!envExample.includes(requiredEnv)) {
    console.error(`.env.example: variable wajib tidak ditemukan: ${requiredEnv}`);
    failed = true;
  }
}

const tusUpload = readFileSync(join(root, 'src/lib/tus-upload.ts'), 'utf8');
const storageEndpoint = readFileSync(join(root, 'src/lib/storage-endpoint.ts'), 'utf8');
if (!storageEndpoint.includes('/storage/v1/upload/resumable')) {
  console.error('src/lib/storage-endpoint.ts: endpoint TUS Supabase tidak ditemukan.');
  failed = true;
}
if (/x-upsert/i.test(tusUpload)) {
  console.error('src/lib/tus-upload.ts: bukti video tidak boleh diunggah dengan x-upsert.');
  failed = true;
}

const sql = readFileSync(join(root, 'supabase/setup.sql'), 'utf8');
for (const requiredSql of [
  "'proof-videos'",
  'create table if not exists public.profiles',
  'create table if not exists public.packing_sessions',
  'create table if not exists public.videos',
  'create table if not exists public.system_state',
  'create policy proof_videos_insert_own',
  'create policy proof_videos_select_own_or_admin',
  'create or replace function public.register_video_segment',
  'create or replace function public.complete_video_upload',
  'create or replace function public.cancel_video_segment',
  'create or replace function public.claim_initial_setup',
  'create or replace function public.complete_initial_setup',
  'create or replace function public.release_initial_setup',
]) {
  if (!sql.toLowerCase().includes(requiredSql.toLowerCase())) {
    console.error(`supabase/setup.sql: bagian wajib tidak ditemukan: ${requiredSql}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`Static verification passed: ${files.length} files checked.`);
