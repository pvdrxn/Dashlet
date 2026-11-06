import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  NoteFileDto,
  NoteContentDto,
  CreateNoteDto,
  UpdateNoteDto,
} from '@widget-master/shared';

function getNotesDirectory(): string {
  if (process.env.NOTES_DIR) {
    fs.mkdirSync(process.env.NOTES_DIR, { recursive: true });
    return process.env.NOTES_DIR;
  }

  if (process.env.APPDATA) {
    const candidate = path.join(process.env.APPDATA, 'dashlet-desktop', 'notes');
    try {
      fs.mkdirSync(candidate, { recursive: true });
      // Probar si realmente se puede escribir en el directorio
      const testFile = path.join(candidate, `.probe-${Date.now()}`);
      fs.writeFileSync(testFile, '', 'utf8');
      fs.unlinkSync(testFile);
      return candidate;
    } catch {
      // Fallback a entorno de desarrollo local si no hay permisos sobre APPDATA
    }
  }

  const fallback = path.join(process.cwd(), 'dashlet-desktop', 'notes');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

@Injectable()
export class NotesService {
  private readonly notesDir: string;

  constructor() {
    this.notesDir = getNotesDirectory();
  }

  private resolveSafePath(filename: string): string {
    const clean = path.basename(filename.trim());
    if (!clean || clean === '.' || clean === '..') {
      throw new BadRequestException('Invalid filename');
    }
    const resolved = path.resolve(this.notesDir, clean);
    if (!resolved.startsWith(this.notesDir)) {
      throw new BadRequestException('Invalid file path');
    }
    return resolved;
  }

  private isNoteFile(name: string): boolean {
    const ext = path.extname(name).toLowerCase();
    return ext === '.md' || ext === '.txt';
  }

  private extractTitle(filename: string, content?: string): string {
    if (content) {
      const match = content.match(/^#\s+(.+)$/m);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
    }
    return path.basename(filename, path.extname(filename));
  }

  listNotes(): NoteFileDto[] {
    const entries = fs.readdirSync(this.notesDir, { withFileTypes: true });
    const notes: NoteFileDto[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !this.isNoteFile(entry.name)) continue;

      const filePath = path.join(this.notesDir, entry.name);
      try {
        const stats = fs.statSync(filePath);
        let sampleContent = '';
        try {
          // Leer los primeros 512 bytes para extraer título si existe #
          const fd = fs.openSync(filePath, 'r');
          const buffer = Buffer.alloc(512);
          const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
          fs.closeSync(fd);
          sampleContent = buffer.toString('utf8', 0, bytesRead);
        } catch {
          // Fallback a nombre de archivo
        }

        const title = this.extractTitle(entry.name, sampleContent);
        notes.push({
          id: entry.name,
          filename: entry.name,
          title,
          updatedAt: stats.mtime.toISOString(),
          size: stats.size,
        });
      } catch {
        // Ignorar archivo si hay error de lectura
      }
    }

    return notes.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  getNote(filename: string): NoteContentDto {
    const filePath = this.resolveSafePath(filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Note "${filename}" not found`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);

    return {
      id: path.basename(filePath),
      filename: path.basename(filePath),
      content,
      updatedAt: stats.mtime.toISOString(),
    };
  }

  createNote(dto: CreateNoteDto): NoteContentDto {
    const rawTitle = (dto.title || 'untitled').trim();
    let sanitizedBase = rawTitle.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60).trim();
    if (!sanitizedBase) sanitizedBase = 'untitled';

    let targetFilename = `${sanitizedBase}.md`;
    let targetPath = path.join(this.notesDir, targetFilename);
    let counter = 1;

    while (fs.existsSync(targetPath)) {
      targetFilename = `${sanitizedBase}-${counter}.md`;
      targetPath = path.join(this.notesDir, targetFilename);
      counter++;
    }

    const content = dto.content !== undefined ? dto.content : `# ${rawTitle}\n\n`;
    fs.writeFileSync(targetPath, content, 'utf8');

    const stats = fs.statSync(targetPath);
    return {
      id: targetFilename,
      filename: targetFilename,
      content,
      updatedAt: stats.mtime.toISOString(),
    };
  }

  updateNote(filename: string, dto: UpdateNoteDto): NoteContentDto {
    const currentPath = this.resolveSafePath(filename);
    if (!fs.existsSync(currentPath)) {
      throw new NotFoundException(`Note "${filename}" not found`);
    }

    let finalPath = currentPath;
    let finalFilename = path.basename(currentPath);

    // Renombrar si el título cambió y es diferente
    if (dto.title && dto.title.trim()) {
      const ext = path.extname(finalFilename) || '.md';
      const cleanTitle = dto.title.trim().replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60).trim();
      const candidateName = `${cleanTitle}${ext}`;

      if (candidateName !== finalFilename) {
        const candidatePath = path.join(this.notesDir, candidateName);
        if (fs.existsSync(candidatePath)) {
          throw new ConflictException(`A note named "${candidateName}" already exists`);
        }
        fs.renameSync(currentPath, candidatePath);
        finalPath = candidatePath;
        finalFilename = candidateName;
      }
    }

    if (dto.content !== undefined) {
      fs.writeFileSync(finalPath, dto.content, 'utf8');
    }

    const content = fs.readFileSync(finalPath, 'utf8');
    const stats = fs.statSync(finalPath);

    return {
      id: finalFilename,
      filename: finalFilename,
      content,
      updatedAt: stats.mtime.toISOString(),
    };
  }

  deleteNote(filename: string): void {
    const filePath = this.resolveSafePath(filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Note "${filename}" not found`);
    }

    fs.unlinkSync(filePath);
  }
}
