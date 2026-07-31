# Arquitectura de TaskFlow

## Visión general

TaskFlow está construido sobre una arquitectura **hexagonal (Ports & Adapters)** combinada con principios de **Domain-Driven Design (DDD)**. El objetivo central es que el núcleo de negocio —el dominio— nunca sepa que existe una base de datos, un framework HTTP o un servicio de almacenamiento en la nube. Todo lo externo es un detalle de implementación intercambiable.

Esta decisión no es dogmática. Viene de una necesidad práctica: si mañana se reemplaza Prisma por TypeORM, PostgreSQL por MongoDB, o NestJS por Fastify, el código de dominio no se toca. Los casos de uso tampoco. Solo cambia el adaptador.

---

## Monorepo

```
taskflow/
├── backend/          NestJS — API REST hexagonal
├── web/              Angular 21 — SPA standalone, zoneless
├── mobile/           Ionic/Angular + Capacitor — iOS y Android
├── docs/             Documentación técnica y de negocio
└── aws/              Scripts de infraestructura (setup.sh / setup.ps1)
```

No hay un tool de monorepo (Nx, Turborepo). Los tres proyectos son independientes: cada uno tiene su propio `package.json`, `tsconfig.json` y pipeline de build. Se despliegan por separado y se comunican solo vía HTTP.

---

## Backend — Arquitectura hexagonal

### Las tres capas de cada módulo

Cada módulo de negocio (`auth`, `tasks`) tiene exactamente cuatro capas:

```
modules/
└── tasks/
    ├── domain/          ← El núcleo. Sin dependencias externas.
    ├── application/     ← Orquestación. Solo habla con interfaces.
    ├── infrastructure/  ← Adaptadores de salida (BD, S3, bcrypt, JWT).
    └── presentation/    ← Adaptadores de entrada (HTTP, DTOs, guards).
```

#### `domain/` — El núcleo

Contiene las entidades, value objects, errores de dominio y **puertos** (interfaces). No importa nada de NestJS, Prisma ni ningún framework. Si se corre en un `node index.js` vacío, compila y funciona.

```
domain/
├── task.entity.ts             Entidad con identidad y comportamiento
├── task.errors.ts             Errores semánticos del dominio
└── task-repository.port.ts    Interfaz + Symbol de inyección
```

Los **puertos de repositorio** son interfaces TypeScript que definen el contrato que la capa de dominio espera de la persistencia:

```ts
// task-repository.port.ts
export const TASK_REPOSITORY = Symbol('TaskRepositoryPort');

export interface TaskRepositoryPort {
  create(data: CreateTaskData): Promise<Task>;
  findByIdAndUserId(id: string, userId: string): Promise<Task | null>;
  list(userId: string, filters: TaskFilters): Promise<PaginatedResult<Task>>;
  update(id: string, patch: TaskPatch): Promise<Task>;
  delete(id: string): Promise<void>;
}
```

El `Symbol` es el token de inyección de dependencias. Las clases concretas nunca aparecen en el dominio.

#### `application/` — Casos de uso

Cada caso de uso es una clase con un único método `execute()`. Recibe un comando (objeto plano con datos de entrada) y devuelve un resultado de dominio. Nunca devuelve entidades de Prisma ni DTOs HTTP.

```ts
@Injectable()
export class CreateTask {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly tasks: TaskRepositoryPort,
  ) {}

  async execute(cmd: CreateTaskCommand): Promise<Task> {
    return this.tasks.create({
      userId:      cmd.userId,
      title:       cmd.title,
      description: cmd.description ?? null,
      priority:    cmd.priority ?? 'MEDIUM',
      dueDate:     cmd.dueDate ?? null,
    });
  }
}
```

La capa de aplicación también define los puertos de servicios que necesita:

```
application/
├── create-task.use-case.ts
├── list-tasks.use-case.ts
├── get-task.use-case.ts
├── update-task.use-case.ts
├── delete-task.use-case.ts
└── upload-task-attachment.use-case.ts
```

#### `infrastructure/` — Adaptadores de salida

Implementan los puertos definidos en el dominio. Aquí vive Prisma, bcrypt, JWT, S3. Si se cambia el ORM, solo cambia este directorio.

```
infrastructure/
├── prisma-task.repository.ts   Implementa TaskRepositoryPort
└── task.mapper.ts              Convierte entre entidad de dominio y modelo Prisma
```

El **mapper** es el punto donde se aísla el modelo de Prisma del dominio. La entidad `Task` de dominio no tiene `@@map`, `@id`, ni nada de Prisma. El mapper transforma en ambas direcciones:

```ts
// task.mapper.ts
static toDomain(record: PrismaTask): Task { ... }
static toCreateInput(data: CreateTaskData): Prisma.TaskCreateInput { ... }
```

#### `presentation/` — Adaptadores de entrada

Transforma peticiones HTTP en comandos para los casos de uso, y resultados de dominio en DTOs para el cliente. Aquí viven los controladores NestJS, guards, decoradores y DTOs con `class-validator`.

```
presentation/
├── tasks.controller.ts         Endpoints HTTP
└── task.dto.ts                 CreateTaskDto, UpdateTaskDto, TaskDto
```

---

### Inyección de dependencias — binding de puertos

El binding entre puerto e implementación ocurre en el módulo NestJS:

```ts
// tasks.module.ts
@Module({
  providers: [
    // Casos de uso
    CreateTask, ListTasks, GetTask, UpdateTask, DeleteTask, UploadTaskAttachment,
    // Binding del puerto al adaptador
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
  ],
})
export class TasksModule {}
```

Este es el único lugar donde la capa de aplicación "conoce" la implementación concreta. En tests, este binding se reemplaza por un mock o un fake in-memory sin tocar ninguna otra clase.

---

### Shared — Infraestructura transversal

```
shared/
├── domain/
│   └── domain.error.ts              Clase base abstracta para todos los errores
├── infrastructure/
│   ├── config/
│   │   ├── env.schema.ts            Validación Zod de todas las variables de entorno
│   │   └── config.module.ts         Expone ConfigService<Env, true> (tipado estricto)
│   ├── prisma/
│   │   ├── prisma.module.ts         Módulo global
│   │   └── prisma.service.ts        Extiende PrismaClient, gestiona lifecycle
│   └── storage/
│       ├── storage.port.ts          Interface StorageServicePort + Symbol
│       ├── s3-storage.service.ts    Implementación S3 content-addressable
│       └── s3-storage.module.ts     Módulo global (@Global)
└── presentation/
    ├── health.controller.ts         GET /api/health — liveness probe sin tocar BD
    ├── filters/
    │   └── all-exceptions.filter.ts Captura cualquier excepción, normaliza respuesta
    └── interceptors/
        └── message-envelope.interceptor.ts  Envuelve respuestas exitosas en { data, message }
```

---

### Schema Prisma — multi-file

Prisma 7 permite dividir el schema en múltiples archivos dentro de `backend/prisma/schema/`. Cada entidad tiene su propio archivo:

```
prisma/schema/
├── schema.prisma      generator + datasource (datasource solo define el proveedor)
├── Enum.prisma        TaskStatus, TaskPriority
├── User.prisma        model User
├── Task.prisma        model Task
└── RefreshToken.prisma model RefreshToken
```

La URL de conexión **no** va en `datasource`. Va en `prisma.config.ts` como driver adapter:

```ts
// prisma.config.ts
datasource: {
  url: process.env.DATABASE_URL,
}
```

Esto permite que `prisma migrate` y `prisma generate` funcionen sin un `.env` en la raíz durante el build de Docker, donde el `DATABASE_URL` viene de Secrets Manager.

---

### Sistema de errores

Todos los errores de dominio extienden `DomainError`:

```ts
// shared/domain/domain.error.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
}
```

Los módulos definen sus errores concretos:

```ts
// tasks/domain/task.errors.ts
export class TaskNotFoundError extends DomainError {
  readonly code    = 'TASK_NOT_FOUND';
  readonly statusCode = 404;
}
```

El `AllExceptionsFilter` captura cualquier error lanzado en la cadena NestJS. Si es un `DomainError`, usa su `code` y `statusCode`. Si es un error de Prisma (P2002 unique violation, etc.), lo mapea a un error HTTP estándar. Si es cualquier otra cosa, devuelve 500.

La respuesta siempre tiene este formato:

```json
{
  "statusCode": 404,
  "code": "TASK_NOT_FOUND",
  "message": "La tarea no existe.",
  "details": null,
  "timestamp": "2026-07-30T10:00:00.000Z",
  "path": "/api/tasks/abc-123"
}
```

Los clientes siempre ramifican por `code`, nunca por `message` ni `statusCode`. El texto puede cambiar o traducirse; el código es el contrato.

---

### Respuestas envelope

Las respuestas exitosas siguen un formato consistente gestionado por el `MessageEnvelopeInterceptor`:

**Mutaciones** (cuando el handler tiene `@ResponseMessage`):
```json
{ "data": { ... }, "message": "Tarea creada correctamente." }
```

**Reads y listados**:
```json
{
  "data": [ ... ],
  "meta": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
}
```

El mensaje se traduce al idioma del cliente mediante `nestjs-i18n`. La clave viene del decorador:

```ts
@Post()
@ResponseMessage('messages.tasks.created')
async create(...): Promise<TaskDto> { ... }
```

---

### JWT y sesiones

El sistema de autenticación usa dos tokens:

**Access token** — JWT firmado con HS256
- Payload: `{ sub: userId, email }`
- TTL corto (15 minutos por defecto)
- Stateless: no hay consulta a BD para validarlo

**Refresh token** — valor opaco de 256 bits
- No es un JWT. Es 32 bytes aleatorios en `base64url`
- Se almacena en BD solo el hash HMAC-SHA256 (nunca el valor en claro)
- El hash es determinista → búsqueda por índice O(1) sin bcrypt
- Se rota en cada uso. Si llega un token ya revocado → todas las sesiones del usuario se revocan (detección de reuso / token theft)

**Transporte dual** según el header `X-Client`:

| Cliente | Access token | Refresh token | CSRF |
|---------|-------------|---------------|------|
| `web`   | Cookie `access_token` httpOnly | Cookie `refresh_token` httpOnly (path `/api/auth/refresh`) | Double-submit cookie `XSRF-TOKEN` |
| `mobile` | Body JSON `accessToken` | Body JSON `refreshToken` | No aplica |

La `JwtStrategy` de Passport extrae el access token primero de la cookie, luego del header `Authorization: Bearer`.

---

### S3 — Almacenamiento content-addressable

El almacenamiento de imágenes usa **content-addressable storage**: la clave S3 es el SHA-256 del contenido, no un UUID ni el nombre original del archivo.

```
key = tasks/<sha256hex>.<ext>
url = https://<bucket>.s3.<region>.amazonaws.com/tasks/<sha256hex>.<ext>
```

Consecuencias:
- **Deduplicación automática**: el mismo archivo subido dos veces genera la misma key. El segundo upload hace un `HeadObject` y devuelve la URL existente sin subir nada.
- **Integridad implícita**: la URL es la prueba de que el contenido es exactamente ese hash.
- **Cleanup seguro**: antes de borrar un objeto S3, `deleteIfOrphaned` consulta cuántas tareas referencian esa URL. Solo borra si ninguna lo usa.

---

## Frontend Web — Angular 21

### La misma arquitectura hexagonal

El frontend replica el patrón del backend en cada feature:

```
features/tasks/
├── domain/
│   ├── task.ts               Interfaz TypeScript de la entidad
│   └── task.repository.ts    Interface del repositorio + token de inyección
├── application/
│   └── tasks.store.ts        NgRx Signals Store — estado + lógica
├── infrastructure/
│   └── http-task.repository.ts  Implementa TaskRepository sobre HttpClient
└── presentation/
    ├── tasks.page.ts          Componente standalone
    ├── tasks.page.html
    └── task-form/             Subcomponente del formulario
```

### NgRx Signals Store

El estado de cada feature vive en un `signalStore`. No hay reducers, ni actions, ni effects. La lógica async va directamente en los métodos del store:

```ts
export const TasksStore = signalStore(
  { providedIn: 'root' },
  withEntities<Task>(),
  withState({ loading: false, error: null as string | null }),
  withComputed(({ entities }) => ({
    hasTasks: computed(() => entities().length > 0),
  })),
  withMethods((store, repo = inject(TASKS_REPOSITORY)) => ({
    async load(filters?: TaskFilters): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const result = await firstValueFrom(repo.list(filters));
        patchState(store, setAllEntities(result.data), { loading: false });
      } catch (err) {
        patchState(store, { loading: false, error: isApiError(err) ? err.code : 'INTERNAL_ERROR' });
      }
    },
  })),
);
```

Los componentes inyectan el store directamente y leen señales:

```ts
@Component({ ... })
export class TasksPage {
  private readonly store = inject(TasksStore);
  tasks = this.store.entities;
  loading = this.store.loading;
}
```

### Sin Zone.js

El proyecto usa `provideZonelessChangeDetection()`. La detección de cambios es completamente explícita y basada en señales. No hay `ChangeDetectorRef.markForCheck()` ni `async` pipe para observables en templates. Las señales del store se leen directamente en el template: `{{ loading() }}`.

### Interceptors HTTP (orden en la cadena)

```
Request  →  clientHeader  →  language  →  authRefresh  →  apiError  →  Backend
Response ←  clientHeader  ←  language  ←  authRefresh  ←  apiError  ←  Backend
```

1. **clientHeader**: añade `X-Client: web` a todas las peticiones
2. **language**: añade `Accept-Language` con el idioma activo
3. **authRefresh**: si la respuesta es 401, refresca el token y reintenta la petición original exactamente una vez
4. **apiError**: normaliza cualquier error HTTP al formato `ApiError` del contrato

---

## Mobile — Ionic/Angular + Capacitor

### Puertos nativos

El mobile tiene tres capacidades nativas encapsuladas detrás de puertos:

```ts
// Tokens de inyección
export const BIOMETRIC_PORT  = new InjectionToken<BiometricPort>('BiometricPort');
export const CAMERA_PORT     = new InjectionToken<CameraPort>('CameraPort');
export const NOTIFICATION_PORT = new InjectionToken<NotificationPort>('NotificationPort');
```

`native.providers.ts` selecciona la implementación en runtime:

```ts
const native = Capacitor.isNativePlatform();
export const NATIVE_PROVIDERS = [
  { provide: CAMERA_PORT,     useClass: native ? CapacitorCameraAdapter     : NoopCameraAdapter },
  { provide: BIOMETRIC_PORT,  useClass: native ? CapacitorBiometricAdapter  : NoopBiometricAdapter },
  { provide: NOTIFICATION_PORT, useClass: native ? CapacitorNotificationAdapter : NoopNotificationAdapter },
];
```

Los adapters `Noop` usan alternativas web (input file, prompt de contraseña) para que la app funcione en `ionic serve` sin un dispositivo real.

### Sesión persistente

A diferencia de la web (cookies httpOnly gestionadas por el navegador), el mobile gestiona los tokens explícitamente:

- `CapacitorSessionStorage` usa `@capacitor/preferences` (equivalente a SharedPreferences en Android, UserDefaults en iOS)
- El access token se persiste en disco. Al arrancar, `AuthStore` rehidrata la sesión: lee el token almacenado, intenta un refresh, y si falla limpia el estado.
- El interceptor `auth.interceptor.ts` inyecta `Authorization: Bearer <accessToken>` en cada petición.
- El interceptor `refresh.interceptor.ts` coordina el refresco cuando llega un 401, evitando múltiples refreshes concurrentes con un `refreshCoordinator`.

---

## Infraestructura AWS

```
Internet
    │
    ▼
ALB (subnets públicas — us-east-2a, us-east-2b)
    │
    ├── /api/* ──► Backend ECS Fargate (port 3000, subnet pública, IP pública)
    │                      │
    │                      ▼
    │              RDS PostgreSQL 16 (subnets PRIVADAS, sin ruta a Internet)
    │
    └── /*     ──► Web ECS Fargate    (port 80, subnet pública, IP pública)
```

### VPC dedicada

- CIDR: `10.0.0.0/16`
- Subnets públicas: `10.0.1.0/24` (AZ-a), `10.0.2.0/24` (AZ-b) — ALB y ECS
- Subnets privadas: `10.0.3.0/24` (AZ-a), `10.0.4.0/24` (AZ-b) — solo RDS

### Security Groups (principio de mínimo privilegio)

| SG | Inbound | Desde |
|----|---------|-------|
| `taskflow-alb-sg` | TCP 80, 443 | `0.0.0.0/0` |
| `taskflow-web-sg` | TCP 80 | `taskflow-alb-sg` |
| `taskflow-backend-sg` | TCP 3000 | `taskflow-alb-sg` |
| `taskflow-rds-sg` | TCP 5432 | `taskflow-backend-sg` únicamente |

RDS no es accesible desde Internet ni desde el contenedor web. Solo el backend puede conectarse a la base de datos.

### Secretos

Ninguna variable sensible está en variables de entorno del task definition en claro. Todas viven en **AWS Secrets Manager** (`taskflow/prod`) y se inyectan via el campo `secrets` del task definition, usando `valueFrom: ARN:CLAVE::`. ECS las resuelve en el momento de lanzar el task; nunca aparecen en logs ni en la API de ECS.

### CI/CD

```
push a main
    │
    ▼
CI (ci.yml)
  ├── secrets-scan (gitleaks — full git history)
  ├── backend (lint + build)
  ├── web (lint + build)
  └── mobile (lint + build)
    │
    ▼ (si CI pasa)
Deploy (deploy.yml)
  ├── Build + push imágenes ECR
  ├── Actualizar Secrets Manager con los valores de GitHub Secrets
  ├── Registrar nuevas task definitions
  ├── Ejecutar migraciones (task ECS one-shot — falla → deploy cancelado)
  ├── Update-service backend + web (rolling deploy)
  └── Esperar que ambos PRIMARY deployments estén en running == desired
```

Las migraciones corren como **task ECS one-shot** antes del rolling deploy. Si fallan, el job se cancela y los servicios en producción no se tocan.

---

## Stack tecnológico

### Backend
| Librería | Versión | Rol |
|----------|---------|-----|
| NestJS | 11.0.1 | Framework HTTP |
| Prisma | 7.9.1 | ORM + migrations |
| PostgreSQL | 16 (RDS) | Base de datos |
| `@nestjs/jwt` | 11.0.2 | Firma/verificación JWT |
| `bcrypt` | 6.0.0 | Hash de contraseñas |
| `nestjs-i18n` | 10.8.5 | Internacionalización |
| `@nestjs/throttler` | 6.5.0 | Rate limiting |
| `@aws-sdk/client-s3` | 3.1099.0 | Upload a S3 |
| `zod` | 4.4.3 | Validación de variables de entorno |
| `helmet` | 8.3.0 | Headers de seguridad HTTP |
| TypeScript | 5.7.3 | |

### Web
| Librería | Versión | Rol |
|----------|---------|-----|
| Angular | 21.2.19 | Framework SPA, standalone, zoneless |
| `@ngrx/signals` | 21.1.1 | Estado reactivo |
| PrimeNG | 21.1.9 | Componentes UI |
| Tailwind CSS | 4.3.3 | Estilos utilitarios |
| `@ngx-translate/core` | 18.0.0 | i18n en cliente |
| TypeScript | 5.9.2 | |

### Mobile
| Librería | Versión | Rol |
|----------|---------|-----|
| `@ionic/angular` | 8.8.16 | Framework UI móvil |
| Capacitor | 8.4.2 | Bridge nativo iOS/Android |
| `@capacitor/camera` | 8.2.1 | Cámara y galería |
| `@capacitor/preferences` | 8.0.1 | Almacenamiento persistente |
| `@capacitor/local-notifications` | 8.2.1 | Notificaciones locales |
| `@aparajita/capacitor-biometric-auth` | 10.0.0 | Biometría |
| `@ngrx/signals` | 21.1.1 | Estado reactivo |
| TypeScript | 5.9.2 | |
