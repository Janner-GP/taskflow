import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import type { Priority, Task, TaskStatus } from '../domain/task.entity';

const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH'];
const STATUSES: TaskStatus[] = ['PENDING', 'COMPLETED'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority'] as const;
const SORT_DIRS = ['asc', 'desc'] as const;

export type SortField = (typeof SORT_FIELDS)[number];
export type SortDir = (typeof SORT_DIRS)[number];

export class CreateTaskDto {
  @ApiProperty({ example: 'Comprar café' })
  @IsString()
  @IsNotEmpty({ message: 'el título es obligatorio' })
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Molido, tienda de la esquina' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: PRIORITIES, example: 'MEDIUM' })
  @IsIn(PRIORITIES, { message: 'priority debe ser LOW, MEDIUM o HIGH' })
  priority!: Priority;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-08-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'el título no puede quedar vacío' })
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES, { message: 'priority debe ser LOW, MEDIUM o HIGH' })
  priority?: Priority;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({
    enum: STATUSES,
    description: 'También es el endpoint para completar/reabrir la tarea.',
  })
  @IsOptional()
  @IsIn(STATUSES, { message: 'status debe ser PENDING o COMPLETED' })
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Eliminar la imagen adjunta actual.' })
  @IsOptional()
  @IsBoolean()
  removeAttachment?: boolean;
}

export class ListTasksQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @ApiPropertyOptional({
    description: 'Búsqueda parcial en el título, case-insensitive.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy: SortField = 'createdAt';

  @ApiPropertyOptional({ enum: SORT_DIRS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_DIRS)
  sortDir: SortDir = 'desc';
}

export class TaskDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: STATUSES })
  status!: TaskStatus;

  @ApiProperty({ enum: PRIORITIES })
  priority!: Priority;

  @ApiProperty({ nullable: true, format: 'date-time', type: String })
  dueDate!: string | null;

  @ApiProperty({ nullable: true, type: String })
  attachmentUrl!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(task: Task): TaskDto {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      attachmentUrl: task.attachmentUrl,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}

/** Envelope de las mutaciones: el recurso + el mensaje localizado por el backend. */
export class TaskEnvelopeDto {
  @ApiProperty({ type: TaskDto })
  data!: TaskDto;

  @ApiProperty({ example: 'Tarea creada correctamente.' })
  message!: string;
}

/** Envelope de una mutación sin recurso de vuelta (delete). */
export class MessageEnvelopeDto {
  @ApiProperty({ nullable: true, type: Object, example: null })
  data!: null;

  @ApiProperty({ example: 'Tarea eliminada correctamente.' })
  message!: string;
}

export class PaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class PaginatedTasksDto {
  @ApiProperty({ type: [TaskDto] })
  data!: TaskDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
