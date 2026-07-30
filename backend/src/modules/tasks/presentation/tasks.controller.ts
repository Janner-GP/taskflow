import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { JwtAuthGuard } from '../../auth/presentation/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/presentation/jwt.strategy';
import { ApiErrorDto } from '../../../shared/presentation/api-error.dto';
import { ResponseMessage } from '../../../shared/presentation/response-message.decorator';
import { CreateTask } from '../application/create-task.use-case';
import { DeleteTask } from '../application/delete-task.use-case';
import { GetTask } from '../application/get-task.use-case';
import { ListTasks } from '../application/list-tasks.use-case';
import { UpdateTask } from '../application/update-task.use-case';
import { UploadTaskAttachment } from '../application/upload-task-attachment.use-case';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  MessageEnvelopeDto,
  PaginatedTasksDto,
  TaskDto,
  TaskEnvelopeDto,
  UpdateTaskDto,
} from './task.dto';

const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@ApiTags('tasks')
@ApiBearerAuth()
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('tasks')

export class TasksController {
  constructor(
    private readonly createTask: CreateTask,
    private readonly listTasks: ListTasks,
    private readonly getTask: GetTask,
    private readonly updateTask: UpdateTask,
    private readonly deleteTask: DeleteTask,
    private readonly uploadTaskAttachment: UploadTaskAttachment,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista las tareas del usuario autenticado',
    description:
      'Filtros, búsqueda, orden y paginación se resuelven en SQL. Un cliente ' +
      'nunca puede pedir tareas de otro usuario: el filtro por dueño no es un ' +
      'parámetro, se deduce del token.',
  })
  @ApiOkResponse({ type: PaginatedTasksDto })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHENTICATED',
    type: ApiErrorDto,
  })
  async list(
    @Query() query: ListTasksQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedTasksDto> {
    const result = await this.listTasks.execute({ ...query, userId: user.id });

    return {
      data: result.data.map((task) => TaskDto.from(task)),
      meta: result.meta,
    };
  }

  @Post()
  @ResponseMessage('messages.tasks.created')
  @ApiOperation({ summary: 'Crea una tarea' })
  @ApiCreatedResponse({ type: TaskEnvelopeDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHENTICATED',
    type: ApiErrorDto,
  })
  async create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaskDto> {
    const task = await this.createTask.execute({
      userId: user.id,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
    });

    return TaskDto.from(task);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene una tarea por id' })
  @ApiOkResponse({ type: TaskDto })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHENTICATED',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 404,
    description: 'TASK_NOT_FOUND — no existe o es de otro usuario',
    type: ApiErrorDto,
  })
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaskDto> {
    const task = await this.getTask.execute(id, user.id);

    return TaskDto.from(task);
  }

  @Patch(':id')
  @ResponseMessage('messages.tasks.updated')
  @ApiOperation({
    summary: 'Actualiza una tarea',
    description:
      'Todos los campos son opcionales. `status` es también el endpoint para ' +
      'completar/reabrir la tarea.',
  })
  @ApiOkResponse({ type: TaskEnvelopeDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHENTICATED',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 404,
    description: 'TASK_NOT_FOUND — no existe o es de otro usuario',
    type: ApiErrorDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaskDto> {
    const task = await this.updateTask.execute({
      id,
      userId: user.id,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      status: dto.status,
    });

    return TaskDto.from(task);
  }

  @Delete(':id')
  @ResponseMessage('messages.tasks.deleted')
  @ApiOperation({ summary: 'Elimina una tarea' })
  @ApiOkResponse({
    type: MessageEnvelopeDto,
    description: 'Tarea eliminada. Devuelve `{ data: null, message }`.',
  })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHENTICATED',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 404,
    description: 'TASK_NOT_FOUND — no existe o es de otro usuario',
    type: ApiErrorDto,
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteTask.execute(id, user.id);
  }

  @Post(':id/attachment')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5_242_880 } }))
  @ResponseMessage('messages.tasks.attachmentUploaded')
  @ApiOperation({ summary: 'Adjunta una imagen a la tarea (máx 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: TaskEnvelopeDto })
  @ApiResponse({ status: 400, description: 'Tipo de archivo no permitido', type: ApiErrorDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'TASK_NOT_FOUND', type: ApiErrorDto })
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaskDto> {
    if (!file) {
      throw new BadRequestException('El campo "file" es obligatorio.');
    }

    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      throw new BadRequestException('Solo se permiten imágenes JPEG, PNG o WebP.');
    }

    const task = await this.uploadTaskAttachment.execute({
      taskId: id,
      userId: user.id,
      buffer: file.buffer,
      mimeType: file.mimetype,
      ext: EXT_BY_MIME[file.mimetype] ?? 'jpg',
    });

    return TaskDto.from(task);
  }
}
