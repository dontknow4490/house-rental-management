import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';
import * as fs from 'fs';

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_DOC_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

export function sanitizeFileExtension(filename: string, allowPdf = false): string {
  const ext = extname(filename || '').toLowerCase();
  const allowed = allowPdf ? ALLOWED_DOC_EXTENSIONS : ALLOWED_IMAGE_EXTENSIONS;
  return allowed.includes(ext) ? ext : '.png';
}

export function validateUploadedFile(
  file: Express.Multer.File,
  options: { allowPdf?: boolean } = {},
) {
  if (!file) return;

  const ext = extname(file.originalname || '').toLowerCase();
  const allowedExtensions = options.allowPdf ? ALLOWED_DOC_EXTENSIONS : ALLOWED_IMAGE_EXTENSIONS;

  if (!allowedExtensions.includes(ext)) {
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch {}
    }
    throw new BadRequestException(
      `Invalid file extension '${ext}'. Allowed types: ${allowedExtensions.join(', ')}`,
    );
  }

  // 10MB size limit safeguard
  const maxBytes = 10 * 1024 * 1024;
  const fileSize = file.size || (file.buffer ? file.buffer.length : 0);
  if (fileSize > maxBytes) {
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch {}
    }
    throw new BadRequestException('File size exceeds the 10MB limit.');
  }

  let buffer: Buffer | null = null;
  if (file.buffer) {
    buffer = file.buffer.subarray(0, 12);
  } else if (file.path && fs.existsSync(file.path)) {
    buffer = Buffer.alloc(12);
    let fd: number | null = null;
    try {
      fd = fs.openSync(file.path, 'r');
      fs.readSync(fd, buffer, 0, 12, 0);
    } finally {
      if (fd !== null) {
        fs.closeSync(fd);
      }
    }
  }

  if (buffer && buffer.length >= 4) {
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    const isWebp =
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;
    const isPdf =
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46;

    let isValidSignature = isJpeg || isPng || isWebp;
    if (options.allowPdf && isPdf) {
      isValidSignature = true;
    }

    if (!isValidSignature) {
      if (file.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch {}
      }
      throw new BadRequestException(
        'File content validation failed. The uploaded file magic bytes do not match an allowed image/PDF format.',
      );
    }
  }
}
