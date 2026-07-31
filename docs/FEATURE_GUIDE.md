# Guía para implementar un nuevo feature

Esta guía explica paso a paso cómo añadir una funcionalidad nueva al sistema, siguiendo los mismos patrones que usan los módulos `auth` y `tasks`. Se usa como ejemplo concreto la implementación de un módulo de **etiquetas (tags)** para tareas.

---

## Principios que guían cada decisión

Antes de escribir código, conviene tener presentes las reglas que siguen todos los módulos existentes:

1. **El dominio no importa nada del exterior.** Las entidades y puertos de repositorio no tienen decoradores de NestJS, ni referencias a Prisma, ni a `HttpClient`. Si el archivo importa algo de `@nestjs/*` o `@prisma/*`, está en la capa equivocada.

2. **Los casos de uso inyectan interfaces, nunca clases concretas.** El token de inyección es siempre un `Symbol` exportado desde el puerto. El binding concreto ocurre solo en el módulo.

3. **Los errores son objetos de dominio, no strings.** Cada error tiene un `code` estable (snake_case en mayúsculas) y un `statusCode` HTTP.

4. **Los mappers aíslan Prisma del dominio.** La entidad de dominio no tiene `@@map` ni nada relacionado con el ORM. El mapper convierte en ambas direcciones.

5. **Los DTOs viven solo en `presentation/`.** La capa de aplicación devuelve entidades de dominio; el controlador las convierte a DTOs antes de responder.

---

## Parte 1 — Backend

### Paso 1.1 — Definir la entidad de dominio

```ts
// backend/src/modules/tags/domain/tag.entity.ts

export interface Tag {
  id: string;
  userId: string;
  name: string;
  color: string;    // hex, ej. "#3B82F6"
  createdAt: Date;
}
```

Las entidades son interfaces simples o clases sin decoradores. Si hay invariantes que validar al construir (como el formato del color), se hace con un factory method estático que lanza un `DomainError` si falla.

### Paso 1.2 — Definir los errores de dominio

```ts
// backend/src/modules/tags/domain/tag.errors.ts
import { DomainError } from '@/shared/domain/domain.error';

export class TagNotFoundError extends DomainError {
  readonly code       = 'TAG_NOT_FOUND';
  readonly statusCode = 404;
  constructor() { super('La etiqueta no existe o no te pertenece.'); }
}

export class DuplicateTagNameError extends DomainError {
  readonly code       = 'DUPLICATE_TAG_NAME';
  readonly statusCode = 409;
  constructor() { super('Ya tienes una etiqueta con ese nombre.'); }
}
```

El mensaje en el constructor es el fallback si no hay traducción i18n disponible.

### Paso 1.3 — Definir el puerto de repositorio

```ts
// backend/src/modules/tags/domain/tag-repository.port.ts

export const TAG_REPOSITORY = Symbol('TagRepositoryPort');

export interface CreateTagData {
  userId: string;
  name: string;
  color: string;
}

export interface TagRepositoryPort {
  create(data: CreateTagData): Promise<Tag>;
  findById(id: string): Promise<Tag | null>;
  findByIdAndUserId(id: string, userId: string): Promise<Tag | null>;
  listByUser(userId: string): Promise<Tag[]>;
  delete(id: string): Promise<void>;
}
```

El puerto describe exactamente lo que los casos de uso necesitan — ni más ni menos. No expone métodos de bajo nivel como `findMany({ where: ... })`.

### Paso 1.4 — Escribir los casos de uso

Cada caso de uso es una clase con un método `execute`. Si necesita más de un colaborador (repositorio + servicio externo), todos se inyectan en el constructor con su token Symbol.

```ts
// backend/src/modules/tags/application/create-tag.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { TAG_REPOSITORY, TagRepositoryPort } from '../domain/tag-repository.port';
import { DuplicateTagNameError } from '../domain/tag.errors';
import { Tag } from '../domain/tag.entity';

export interface CreateTagCommand {
  userId: string;
  name: string;
  color: string;
}

@Injectable()
export class CreateTag {
  constructor(
    @Inject(TAG_REPOSITORY)
    private readonly tags: TagRepositoryPort,
  ) {}

  async execute(cmd: CreateTagCommand): Promise<Tag> {
    const existing = await this.tags.listByUser(cmd.userId);
    if (existing.some(t => t.name.toLowerCase() === cmd.name.toLowerCase())) {
      throw new DuplicateTagNameError();
    }
    return this.tags.create(cmd);
  }
}
```

```ts
// backend/src/modules/tags/application/delete-tag.use-case.ts
@Injectable()
export class DeleteTag {
  constructor(
    @Inject(TAG_REPOSITORY)
    private readonly tags: TagRepositoryPort,
  ) {}

  async execute(id: string, userId: string): Promise<void> {
    const tag = await this.tags.findByIdAndUserId(id, userId);
    if (!tag) throw new TagNotFoundError();
    await this.tags.delete(id);
  }
}
```

### Paso 1.5 — Extender el schema Prisma

Crear un nuevo archivo en `backend/prisma/schema/`:

```prisma
// backend/prisma/schema/Tag.prisma

model Tag {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @db.VarChar(50)
  color     String   @db.VarChar(7)
  createdAt DateTime @default(now())

  userId String @db.Uuid
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, name])
  @@index([userId])
  @@map("tsf_tags")
}
```

Convención: el nombre de la tabla siempre lleva el prefijo `tsf_`. El `@@unique([userId, name])` enforza a nivel de BD la constraint que el caso de uso también comprueba (defense in depth).

Si el modelo tiene relación con `Task` (etiquetas por tarea), añadir la relación intermedia:

```prisma
// Añadir en Task.prisma
tags TaskTag[]

// Nuevo archivo TaskTag.prisma
model TaskTag {
  taskId String @db.Uuid
  tagId  String @db.Uuid
  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  tag    Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([taskId, tagId])
  @@map("tsf_task_tags")
}
```

Luego generar la migración:

```bash
cd backend
npx prisma migrate dev --name add_tags
npx prisma generate
```

El comando `migrate dev` crea el archivo SQL en `prisma/migrations/` y lo aplica a la BD local. En producción, `prisma migrate deploy` aplica las migraciones pendientes.

### Paso 1.6 — Implementar el repositorio Prisma

```ts
// backend/src/modules/tags/infrastructure/prisma-tag.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { TagRepositoryPort, CreateTagData } from '../domain/tag-repository.port';
import { Tag } from '../domain/tag.entity';
import { TagMapper } from './tag.mapper';

@Injectable()
export class PrismaTagRepository implements TagRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateTagData): Promise<Tag> {
    const record = await this.prisma.tag.create({ data });
    return TagMapper.toDomain(record);
  }

  async findById(id: string): Promise<Tag | null> {
    const record = await this.prisma.tag.findUnique({ where: { id } });
    return record ? TagMapper.toDomain(record) : null;
  }

  async findByIdAndUserId(id: string, userId: string): Promise<Tag | null> {
    const record = await this.prisma.tag.findFirst({ where: { id, userId } });
    return record ? TagMapper.toDomain(record) : null;
  }

  async listByUser(userId: string): Promise<Tag[]> {
    const records = await this.prisma.tag.findMany({ where: { userId }, orderBy: { name: 'asc' } });
    return records.map(TagMapper.toDomain);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.tag.delete({ where: { id } });
  }
}
```

```ts
// backend/src/modules/tags/infrastructure/tag.mapper.ts
import { Tag as PrismaTag } from '@prisma/client';
import { Tag } from '../domain/tag.entity';

export class TagMapper {
  static toDomain(record: PrismaTag): Tag {
    return {
      id:        record.id,
      userId:    record.userId,
      name:      record.name,
      color:     record.color,
      createdAt: record.createdAt,
    };
  }
}
```

### Paso 1.7 — Crear los DTOs y el controlador

```ts
// backend/src/modules/tags/presentation/tag.dto.ts
import { IsString, IsHexColor, MaxLength } from 'class-validator';
import { Tag } from '../domain/tag.entity';

export class CreateTagDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsHexColor()
  color: string;
}

export class TagDto {
  id: string;
  name: string;
  color: string;
  createdAt: string;

  static from(tag: Tag): TagDto {
    return { id: tag.id, name: tag.name, color: tag.color, createdAt: tag.createdAt.toISOString() };
  }
}
```

```ts
// backend/src/modules/tags/presentation/tags.controller.ts
import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/presentation/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/presentation/current-user.decorator';
import { ResponseMessage } from '@/shared/presentation/response-message.decorator';
import { CreateTag } from '../application/create-tag.use-case';
import { DeleteTag } from '../application/delete-tag.use-case';
import { ListTags } from '../application/list-tags.use-case';
import { CreateTagDto, TagDto } from './tag.dto';

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(
    private readonly createTag: CreateTag,
    private readonly deleteTag: DeleteTag,
    private readonly listTags: ListTags,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: TagDto[] }> {
    const tags = await this.listTags.execute(user.id);
    return { data: tags.map(TagDto.from) };
  }

  @Post()
  @ResponseMessage('messages.tags.created')
  async create(@Body() dto: CreateTagDto, @CurrentUser() user: AuthenticatedUser): Promise<TagDto> {
    const tag = await this.createTag.execute({ userId: user.id, ...dto });
    return TagDto.from(tag);
  }

  @Delete(':id')
  @ResponseMessage('messages.tags.deleted')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.deleteTag.execute(id, user.id);
  }
}
```

### Paso 1.8 — Registrar el módulo

```ts
// backend/src/modules/tags/tags.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';
import { TAG_REPOSITORY } from './domain/tag-repository.port';
import { PrismaTagRepository } from './infrastructure/prisma-tag.repository';
import { CreateTag } from './application/create-tag.use-case';
import { DeleteTag } from './application/delete-tag.use-case';
import { ListTags } from './application/list-tags.use-case';
import { TagsController } from './presentation/tags.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TagsController],
  providers: [
    CreateTag, DeleteTag, ListTags,
    { provide: TAG_REPOSITORY, useClass: PrismaTagRepository },
  ],
})
export class TagsModule {}
```

Luego importar en `AppModule`:

```ts
// app.module.ts
imports: [ ..., TagsModule ],
```

### Paso 1.9 — Añadir las traducciones i18n

```json
// backend/src/i18n/es/messages.json (añadir en la sección "tags")
{
  "tags": {
    "created": "Etiqueta creada correctamente.",
    "deleted": "Etiqueta eliminada."
  },
  "errors": {
    "TAG_NOT_FOUND":      "La etiqueta no existe.",
    "DUPLICATE_TAG_NAME": "Ya tienes una etiqueta con ese nombre."
  }
}
```

```json
// backend/src/i18n/en/messages.json
{
  "tags": {
    "created": "Tag created successfully.",
    "deleted": "Tag deleted."
  },
  "errors": {
    "TAG_NOT_FOUND":      "Tag not found.",
    "DUPLICATE_TAG_NAME": "You already have a tag with that name."
  }
}
```

---

## Parte 2 — Frontend Web (Angular)

### Paso 2.1 — Definir la interface y el puerto

```ts
// web/src/app/features/tags/domain/tag.ts
export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface CreateTagPayload {
  name: string;
  color: string;
}
```

```ts
// web/src/app/features/tags/domain/tag.repository.ts
import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Tag, CreateTagPayload } from './tag';

export interface TagRepository {
  list(): Observable<Tag[]>;
  create(payload: CreateTagPayload): Observable<Tag>;
  delete(id: string): Observable<void>;
}

export const TAGS_REPOSITORY = new InjectionToken<TagRepository>('TagsRepository');
```

### Paso 2.2 — Implementar el repositorio HTTP

```ts
// web/src/app/features/tags/infrastructure/http-tag.repository.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { TagRepository } from '../domain/tag.repository';
import { Tag, CreateTagPayload } from '../domain/tag';

@Injectable({ providedIn: 'root' })
export class HttpTagRepository implements TagRepository {
  private readonly http = inject(HttpClient);

  list(): Observable<Tag[]> {
    return this.http.get<{ data: Tag[] }>('/api/tags').pipe(map(r => r.data));
  }

  create(payload: CreateTagPayload): Observable<Tag> {
    return this.http.post<{ data: Tag }>('/api/tags', payload).pipe(map(r => r.data));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/tags/${id}`);
  }
}
```

### Paso 2.3 — Crear el store NgRx Signals

```ts
// web/src/app/features/tags/application/tags.store.ts
import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withEntities, patchState } from '@ngrx/signals';
import { setAllEntities, addEntity, removeEntity } from '@ngrx/signals/entities';
import { firstValueFrom } from 'rxjs';
import { TAGS_REPOSITORY } from '../domain/tag.repository';
import { Tag, CreateTagPayload } from '../domain/tag';

interface TagsState {
  loading: boolean;
  error: string | null;
}

export const TagsStore = signalStore(
  { providedIn: 'root' },
  withEntities<Tag>(),
  withState<TagsState>({ loading: false, error: null }),
  withMethods((store, repo = inject(TAGS_REPOSITORY)) => ({

    async load(): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const tags = await firstValueFrom(repo.list());
        patchState(store, setAllEntities(tags), { loading: false });
      } catch {
        patchState(store, { loading: false, error: 'LOAD_FAILED' });
      }
    },

    async create(payload: CreateTagPayload): Promise<void> {
      const tag = await firstValueFrom(repo.create(payload));
      patchState(store, addEntity(tag));
    },

    async remove(id: string): Promise<void> {
      await firstValueFrom(repo.delete(id));
      patchState(store, removeEntity(id));
    },

  })),
);
```

### Paso 2.4 — Registrar el repositorio en app.config.ts

```ts
// web/src/app/app.config.ts
import { TAGS_REPOSITORY } from './features/tags/domain/tag.repository';
import { HttpTagRepository } from './features/tags/infrastructure/http-tag.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... providers existentes
    { provide: TAGS_REPOSITORY, useExisting: HttpTagRepository },
  ],
};
```

### Paso 2.5 — Crear el componente

```ts
// web/src/app/features/tags/presentation/tags.page.ts
import { Component, OnInit, inject } from '@angular/core';
import { TagsStore } from '../application/tags.store';

@Component({
  selector: 'app-tags-page',
  standalone: true,
  templateUrl: './tags.page.html',
})
export class TagsPage implements OnInit {
  private readonly store = inject(TagsStore);

  tags     = this.store.entities;
  loading  = this.store.loading;
  error    = this.store.error;

  ngOnInit(): void {
    this.store.load();
  }

  delete(id: string): void {
    this.store.remove(id);
  }
}
```

---

## Parte 3 — Mobile (Ionic/Angular)

El mobile sigue exactamente la misma estructura que el web, con dos diferencias:

**1. El repositorio usa tokens Bearer en header** (no cookies):

```ts
// El interceptor auth.interceptor.ts ya añade el Bearer token automáticamente.
// No hay nada extra que hacer en el repositorio.
```

**2. El store usa `CapacitorSessionStorage` para persistencia** si necesita cachear datos offline:

```ts
// Si el feature necesita funcionar offline, inyectar SESSION_STORAGE_PORT
// y serializar/deserializar el estado al guardarlo.
```

Para acceso a cámara o biometría en el flujo del feature, inyectar el puerto correspondiente:

```ts
private readonly camera = inject(CAMERA_PORT);

async attachPhoto(): Promise<void> {
  const photo = await this.camera.takePhoto();
  if (!photo) return; // usuario canceló
  // usar photo.base64 y photo.format
}
```

---

## Checklist completo de un nuevo feature

### Backend
- [ ] `domain/entidad.entity.ts` — interfaz de la entidad
- [ ] `domain/entidad.errors.ts` — errores con `code` y `statusCode`
- [ ] `domain/entidad-repository.port.ts` — interface + Symbol exportado
- [ ] `application/accion.use-case.ts` — uno por caso de uso
- [ ] `prisma/schema/Entidad.prisma` — modelo con prefijo `tsf_`
- [ ] Migración: `npx prisma migrate dev --name add_entidad`
- [ ] `infrastructure/prisma-entidad.repository.ts` — implementa el puerto
- [ ] `infrastructure/entidad.mapper.ts` — toDomain + toCreateInput
- [ ] `presentation/entidad.dto.ts` — DTOs de entrada/salida
- [ ] `presentation/entidad.controller.ts` — endpoints con `@UseGuards(JwtAuthGuard)`
- [ ] `entidad.module.ts` — registra providers + binding del puerto
- [ ] Importar el módulo en `app.module.ts`
- [ ] `i18n/es/messages.json` + `i18n/en/messages.json` — claves de mensajes y errores

### Frontend (web y mobile)
- [ ] `domain/entidad.ts` — interface TypeScript
- [ ] `domain/entidad.repository.ts` — interface + InjectionToken
- [ ] `infrastructure/http-entidad.repository.ts` — implementa sobre HttpClient
- [ ] `application/entidad.store.ts` — signalStore con estado + métodos
- [ ] `presentation/entidad.page.ts` — componente standalone
- [ ] Registrar el repositorio en `app.config.ts`
- [ ] Añadir la ruta en `app.routes.ts`
- [ ] Añadir traducciones en `public/i18n/es.json` + `en.json`

### CI/CD
- [ ] Si hay nueva variable de entorno: añadirla a `env.schema.ts`, a GitHub Secrets, al step de Secrets Manager en `deploy.yml`, y al task definition JSON en `deploy.yml`

---

## Patrones que no varían

**Nunca usar `console.log` en producción.** NestJS usa `Logger`. Angular usa el `ErrorHandler` global.

**Nunca lanzar errores HTTP desde la capa de aplicación.** Solo errores de dominio (`DomainError`). El filtro global los convierte a HTTP.

**Nunca filtrar por ownership en el query de listado fuera del repositorio.** El `userId` del JWT debe llegar al repositorio como filtro obligatorio, no como post-proceso en memoria.

**Nunca devolver el token de refresh en un endpoint que no sea `/auth/refresh`.** Ni en la respuesta de login si el cliente es web (va en cookie httpOnly).
