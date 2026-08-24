import { join, resolve } from 'path';
import * as fs from 'fs';

/**
 * Returns the absolute canonical root path for the uploads directory.
 * Ensures consistent resolution regardless of whether the server is started from
 * project root, backend folder, or inside container.
 */
export function getUploadsRoot(): string {
  // If explicitly configured via env
  if (process.env.UPLOAD_DIR) {
    const customPath = resolve(process.cwd(), process.env.UPLOAD_DIR);
    if (!fs.existsSync(customPath)) {
      fs.mkdirSync(customPath, { recursive: true });
    }
    return customPath;
  }

  // Determine if cwd is backend directory or project root
  const cwd = process.cwd();
  if (fs.existsSync(join(cwd, 'backend', 'uploads'))) {
    return join(cwd, 'backend', 'uploads');
  }

  const defaultPath = join(cwd, 'uploads');
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
  }
  return defaultPath;
}

export function getUploadSubdir(subdir: string): string {
  const root = getUploadsRoot();
  const fullPath = join(root, ...subdir.split('/'));
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return fullPath;
}
