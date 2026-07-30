import { Module } from '@nestjs/common';

import { CreateTask } from './application/create-task.use-case';
import { DeleteTask } from './application/delete-task.use-case';
import { GetTask } from './application/get-task.use-case';
import { ListTasks } from './application/list-tasks.use-case';
import { UpdateTask } from './application/update-task.use-case';
import { UploadTaskAttachment } from './application/upload-task-attachment.use-case';
import { TASK_REPOSITORY } from './domain/task-repository.port';
import { PrismaTaskRepository } from './infrastructure/prisma-task.repository';
import { TasksController } from './presentation/tasks.controller';

@Module({
  controllers: [TasksController],
  providers: [
    CreateTask,
    ListTasks,
    GetTask,
    UpdateTask,
    DeleteTask,
    UploadTaskAttachment,
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
  ],
})
export class TasksModule {}
