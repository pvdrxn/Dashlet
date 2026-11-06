import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotesService } from './notes.service';
import {
  NoteFileDto,
  NoteContentDto,
  CreateNoteDto,
  UpdateNoteDto,
} from '@widget-master/shared';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  listNotes(): NoteFileDto[] {
    return this.notesService.listNotes();
  }

  @Get(':filename')
  getNote(@Param('filename') filename: string): NoteContentDto {
    return this.notesService.getNote(filename);
  }

  @Post()
  createNote(@Body() dto: CreateNoteDto): NoteContentDto {
    return this.notesService.createNote(dto);
  }

  @Patch(':filename')
  updateNote(
    @Param('filename') filename: string,
    @Body() dto: UpdateNoteDto,
  ): NoteContentDto {
    return this.notesService.updateNote(filename, dto);
  }

  @Delete(':filename')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(@Param('filename') filename: string): void {
    this.notesService.deleteNote(filename);
  }
}
