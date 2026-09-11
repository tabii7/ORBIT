import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

export type SavedUpload = {
  storagePath: string;
  publicUrl: string;
  absolutePath: string;
};

@Injectable()
export class FileStorageService {
  private readonly rootDir: string;

  constructor(private readonly config: ConfigService) {
    this.rootDir =
      this.config.get<string>('UPLOAD_DIR') || '/var/orbit/uploads';
  }

  async ensureRoot() {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  async saveBuffer(params: {
    userId: string;
    originalName: string;
    buffer: Buffer;
    subdir?: string;
  }): Promise<SavedUpload> {
    await this.ensureRoot();
    const safeName = params.originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const relative = path.join(
      params.subdir || 'chat',
      params.userId,
      `${Date.now()}-${randomUUID()}-${safeName}`,
    );
    const absolutePath = path.join(this.rootDir, relative);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, params.buffer);
    return {
      storagePath: relative,
      absolutePath,
      publicUrl: `/uploads/${relative.split(path.sep).join('/')}`,
    };
  }

  absolutePath(storagePath: string) {
    return path.join(this.rootDir, storagePath);
  }

  async readBuffer(storagePath: string) {
    return fs.readFile(this.absolutePath(storagePath));
  }
}
