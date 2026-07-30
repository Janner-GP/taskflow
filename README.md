# TaskFlow

Aplicación de gestión de tareas personales con **API REST segura** (NestJS), **SPA web** (Angular 21) y **app móvil híbrida** (Ionic/Angular + Capacitor), desplegada en **AWS ECS Fargate**.

---

## Índice

1. [Descripción](#1-descripción)
2. [Arquitectura](#2-arquitectura)
3. [Tecnologías y justificación](#3-tecnologías-y-justificación)
4. [Cómo ejecutarlo](#4-cómo-ejecutarlo)
5. [Variables de entorno](#5-variables-de-entorno)
6. [Despliegue en AWS](#6-despliegue-en-aws)
7. [Decisiones técnicas](#7-decisiones-técnicas)
8. [Capturas de pantalla](#8-capturas-de-pantalla)
9. [Limitaciones conocidas](#9-limitaciones-conocidas)

---

## 1. Descripción

TaskFlow permite a los usuarios registrarse, iniciar sesión y gestionar sus tareas personales. Cada usuario ve y opera únicamente sus propias tareas; solicitar o modificar una tarea ajena devuelve `404`, no `403`, para no confirmar la existencia del recurso.

**Funcionalidades implementadas:**

- Registro y login con JWT — cookies `httpOnly` en web, Bearer token en mobile
- Refresh token con rotación y revocación en cascada (reuso detectado → todas las sesiones del usuario revocadas)
- CRUD completo de tareas: filtros, búsqueda full-text, ordenación y paginación resuelta en base de datos
- Cambio de estado pendiente / completada desde la lista
- Adjuntar imágenes a tareas vía cámara nativa (Capacitor) o `<input type="file">`
- Almacenamiento en S3 con deduplicación por hash SHA-256 (misma imagen → un solo objeto)
- Limpieza automática de imágenes huérfanas al borrar una tarea

---

## 2. Arquitectura

```
                        Internet
                            │
                            ▼
              ┌─── ALB taskflow-alb (puerto 80) ───┐
              │         Subred pública              │
              │  /api/* → Backend TG               │
              │  /*     → Web TG                   │
              └────────────┬────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
  ┌─── Web ECS Fargate ───┐  ┌─── Backend ECS Fargate ───┐
  │   nginx  · port 80    │  │   NestJS · port 3000      │
  │   subred pública      │  │   subred pública           │
  └───────────────────────┘  └───────────┬───────────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          ▼                             ▼
             ┌── RDS PostgreSQL ──┐      ┌── Secrets Manager ──┐
             │  subred PRIVADA    │      │  taskflow/prod       │
             │  SG: solo 5432     │      │  DATABASE_URL        │
             │  desde backend-sg  │      │  JWT_*  COOKIE_*     │
             └────────────────────┘      │  AWS_ACCESS_KEY_*    │
                                         └─────────────────────-┘

  VPC taskflow (10.0.0.0/16)
  ├── Públicas  10.0.1/2.0/24 — ALB + ECS (assignPublicIp=ENABLED)
  └── Privadas  10.0.3/4.0/24 — RDS (sin ruta a Internet Gateway)
```

### Estructura de carpetas

```
taskflow/
├── backend/               NestJS — Arquitectura Hexagonal
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── domain/          entidades, puertos
│   │   │   │   ├── application/     casos de uso
│   │   │   │   ├── infrastructure/  Prisma, JWT adapters
│   │   │   │   └── presentation/    controladores, DTOs
│   │   │   └── tasks/               (misma estructura)
│   │   └── shared/
│   │       └── infrastructure/
│   │           ├── config/          Zod env schema
│   │           └── storage/         S3StorageModule (global)
│   └── prisma/            schema + migraciones
│
├── web/                   Angular 21 SPA
│   └── src/app/
│       ├── core/          auth, interceptors, guards
│       └── features/tasks/
│           ├── domain/          puertos e interfaces
│           ├── application/     NgRx Signals store
│           ├── infrastructure/  HTTP adapters
│           └── presentation/    páginas y componentes
│
├── mobile/                Ionic/Angular + Capacitor
│   └── src/app/
│       ├── core/native/   adapters: cámara, biometría
│       └── features/tasks/
│
├── aws/
│   └── setup.sh           provisioning idempotente de infra AWS
├── docker-compose.yml     prod (backend + web, sin postgres — usa RDS)
├── docker-compose.dev.yml dev  (solo postgres local)
├── docs/CONTRACT.md       contrato de API compartido entre los tres proyectos
└── .github/workflows/ci.yml
```

### Backend — Arquitectura Hexagonal

```
domain/          → entidad Task con invariantes, puertos (interfaces)
application/     → un caso de uso por operación; solo depende de puertos
infrastructure/  → Prisma, S3, JWT (adaptadores que implementan los puertos)
presentation/    → controladores HTTP y DTOs (mapea HTTP ↔ casos de uso)
```

Tres reglas que sostienen la separación:

1. **Prisma nunca sale de `infrastructure/`.** Los casos de uso dependen de `TaskRepositoryPort`, no de `PrismaClient`.
2. **El dominio no conoce HTTP.** Lanza errores de dominio; un exception filter centralizado los traduce a códigos de estado.
3. **La autorización es una regla de dominio**, no un `if` en el controller: `Task.assertOwnedBy(userId)`.

---

## 3. Tecnologías y justificación

### Backend

| Tecnología | Motivo |
|---|---|
| **NestJS 11** | Módulos y DI nativos; la arquitectura hexagonal sale natural. Decoradores `@ApiProperty` generan OpenAPI sin archivos de spec adicionales |
| **Prisma 6** | Tipado end-to-end y migraciones versionadas. Encapsulado tras puertos, porque el cliente es infraestructura, no dominio |
| **PostgreSQL** | Relacional cerrado (usuario ⇄ tareas); índices compuestos para filtros y paginación en BD |
| **JWT + cookies httpOnly** | Cookies evitan acceso JS al token (XSS); Bearer tokens son compatibles con WebView/mobile sin fricciones |
| **@aws-sdk/client-s3 v3** | SDK modular tree-shakeable; sin herencia de la API v2 |
| **nestjs-i18n** | Mensajes de error localizados (es/en) desde archivos JSON; sin strings hardcodeados |
| **Zod** | Validación del entorno al arrancar; falla rápido con mensaje legible si falta una variable |

### Web

| Tecnología | Motivo |
|---|---|
| **Angular 21** | SPA con TypeScript estricto, standalone components, zoneless (rendimiento sin Zone.js) |
| **NgRx Signals Store** | Es NgRx oficial sin el boilerplate de actions/reducers/effects; integra nativamente con Signals |
| **PrimeNG 21** | Componentes ricos de escritorio (tabla, dialog, datepicker) sin implementarlos desde cero |

> **Por qué Angular 21 y no 22:** `@ngrx/signals@21` declara peer `@angular/core: ^21`. No existe combinación estable con Angular 22 + NgRx + PrimeNG sin dependencias beta. Angular 21 alinea todo el stack con un `npm install` limpio.

### Mobile

| Tecnología | Motivo |
|---|---|
| **Ionic 8 + Angular** | Componentes mobile-first, comparte la lógica con el equipo web |
| **Capacitor 7** | Bridge nativo moderno; acceso a cámara, biometría y notificaciones con API unificada |
| **@capacitor/camera** | Foto nativa o galería en device; fallback a `<input type="file">` en browser |

### Infraestructura

| Servicio | Motivo |
|---|---|
| **ECS Fargate** | Contenedores sin gestionar servidores; pago por uso |
| **ECR** | Registry privado en la misma cuenta; sin coste de transferencia intra-región |
| **RDS PostgreSQL** | Managed DB: backups automáticos, failover sin overhead de ops |
| **S3** | Almacenamiento de objetos de bajo coste; URL pública directa sin servidor de assets |
| **ALB** | Ruteo path-based: `/api/*` → backend, `/*` → web; health checks integrados |
| **GitHub Actions** | CI/CD en el repo; secrets nativos; sin infraestructura extra |

---

## 4. Cómo ejecutarlo

**Requisitos:** Node.js 22+, npm 10+, Docker Desktop.

```bash
cp .env.example .env
# editar .env con los valores locales
```

### A. Desarrollo local (recomendado — HMR funcional)

```bash
# 1. Arrancar solo postgres
docker compose -f docker-compose.dev.yml up -d

# 2. Backend
cd backend
npm install
npx prisma migrate dev
npm run start:dev
# API:    http://localhost:3000
# Swagger: http://localhost:3000/api/docs

# 3. Web (otra terminal)
cd web && npm install && npm start
# http://localhost:4200

# 4. Mobile (otra terminal)
cd mobile && npm install && npm start
# http://localhost:4201  (ionic serve con browser fallback)
```

### B. Stack completo en Docker (prod-like, sin AWS)

> Requiere `DATABASE_URL` en `.env` apuntando a un PostgreSQL accesible (RDS o local externo al compose).

```bash
docker compose up --build
# http://localhost:8080
```

### C. Mobile en Android

```bash
cd mobile
npm run build
npx cap sync android
npx cap run android
```

El emulador Android no ve `localhost` del host: la app usa `http://10.0.2.2:3000/api`.

---

## 5. Variables de entorno

Todas con comentarios en [`.env.example`](.env.example).

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | URL de conexión PostgreSQL (Prisma) |
| `NODE_ENV` | `development` / `production` |
| `PORT` | Puerto HTTP del backend (defecto `3000`) |
| `SWAGGER_ENABLED` | Activa `/api/docs`; `false` en producción |
| `JWT_ACCESS_SECRET` | Secreto para firmar access tokens (≥ 48 bytes) |
| `JWT_REFRESH_SECRET` | Secreto para firmar refresh tokens (distinto del anterior) |
| `COOKIE_SECRET` | Secreto para firmar cookies (distinto de los anteriores) |
| `ACCESS_TOKEN_TTL` | Duración del access token (ej. `15m`) |
| `REFRESH_TOKEN_TTL` | Duración del refresh token (ej. `7d`) |
| `BCRYPT_ROUNDS` | Factor de coste de bcrypt (recomendado `12`) |
| `CORS_ORIGIN` | Lista de orígenes separada por comas, nunca `*` |
| `APP_PUBLIC_URL` | URL pública de la aplicación |
| `THROTTLE_TTL` | Ventana de rate limiting en segundos |
| `THROTTLE_LIMIT` | Máximo de peticiones por ventana en `/auth/*` |
| `TRUSTED_PROXY_IP` | IP del proxy de confianza para `X-Forwarded-For` |
| `AWS_REGION` | Región AWS (ej. `us-east-2`) |
| `AWS_ACCESS_KEY_ID` | Clave IAM con permisos S3 |
| `AWS_SECRET_ACCESS_KEY` | Secreto IAM correspondiente |
| `S3_BUCKET_NAME` | Nombre del bucket S3 para imágenes adjuntas |
| `POSTGRES_DB/USER/PASSWORD` | Solo para el compose de dev (contenedor local) |
| `WEB_API_URL` | Base URL de la API inyectada en build time (web) |
| `MOBILE_API_URL` | URL completa de la API inyectada en build time (mobile) |

---

## 6. Despliegue en AWS

### Paso 1 — Provisionamiento de infraestructura (una sola vez)

Requiere AWS CLI v2 configurado.

```bash
bash aws/setup.sh
```

El script crea de forma **idempotente**:

- S3 bucket con política de lectura pública en `tasks/*`
- 2 repositorios ECR (`taskflow-backend`, `taskflow-web`)
- IAM execution role para ECS (`AmazonECSTaskExecutionRolePolicy`)
- ECS cluster `taskflow` (Fargate)
- VPC por defecto + security groups (ALB → backend 3000, ALB → web 80)
- ALB con reglas: `/api/*` → backend TG, `/*` → web TG
- CloudWatch log groups
- ECS services con task definition placeholder

Al terminar, imprime la tabla de GitHub Secrets con el DNS del ALB.

### Paso 2 — Configurar GitHub Secrets

`GitHub repo → Settings → Secrets and variables → Actions`

| Secret | Valor |
|---|---|
| `AWS_REGION` | `us-east-2` |
| `AWS_ACCOUNT_ID` | ID numérico de la cuenta AWS |
| `AWS_ACCESS_KEY_ID` | Clave IAM del usuario de deploy |
| `AWS_SECRET_ACCESS_KEY` | Secreto IAM |
| `DATABASE_URL` | URL de conexión a RDS (con password URL-encoded) |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` (distinto) |
| `COOKIE_SECRET` | `openssl rand -base64 48` (distinto) |
| `S3_BUCKET_NAME` | `taskflow-storage` |
| `CORS_ORIGIN` | `http://<ALB-DNS>` (lo imprime setup.sh) |
| `APP_PUBLIC_URL` | `http://<ALB-DNS>` |

### Paso 3 — Deploy

```bash
git push origin main
```

El pipeline CI/CD (`.github/workflows/ci.yml`) ejecuta:

1. Escaneo de secretos con **gitleaks** (falla si hay credenciales en el historial)
2. Build, lint y typecheck de **backend**, **web** y **mobile**
3. Build de imágenes Docker y push a **ECR** (tag `sha-<commit>`)
4. **Actualizar Secrets Manager** (`taskflow/prod`) con los valores de GitHub Secrets usando `jq` para serializar el JSON de forma segura
5. Registro de task definitions:
   - Backend: vars sensibles en campo `secrets` (referenciadas por ARN desde Secrets Manager), no sensibles en `environment`
   - Web: solo `environment` con vars públicas
6. `ecs update-service` + `ecs wait services-stable`

**Flujo de secretos:** GitHub Secrets → runner (en memoria) → Secrets Manager → ECS agent (al arrancar la task) → variables de entorno del proceso. Los secretos nunca aparecen en la API de ECS ni en ningún archivo en disco.

---

## 7. Decisiones técnicas

### Doble transporte de autenticación

|  | Web | Mobile |
|---|---|---|
| Transporte | Cookies `httpOnly` `Secure` `SameSite=Lax` | `Authorization: Bearer` |
| Cómo se indica | Header `X-Client: web` (defecto) | Header `X-Client: mobile` |
| Access token | 15 min, cookie opaca para JS | 15 min, en memoria |
| Refresh token | 7 d, cookie `httpOnly` | 7 d, secure storage nativo |
| Rehidratar sesión | `GET /api/auth/me` al arrancar | leer secure storage → refresh |
| CSRF | double-submit: `XSRF-TOKEN` + `X-XSRF-TOKEN` | no aplica |

Las cookies `httpOnly` hacen el JWT inaccesible a JavaScript, cerrando la superficie de XSS. Mobile usa Bearer porque las cookies en WebView son frágiles y el refresh en secure storage habilita el desbloqueo biométrico.

**Ambos caminos son adaptadores sobre el mismo caso de uso.** Cero duplicación de lógica de autenticación.

### CSRF por double-submit cookie

El backend emite la cookie `XSRF-TOKEN` (legible por JS, `httpOnly: false`) y la exige como header `X-XSRF-TOKEN` en cada mutación. Un atacante de otro origen puede provocar que el navegador envíe la cookie, pero no puede leerla para copiarla al header (same-origin policy). Angular lo implementa nativamente con `withXsrfConfiguration`.

### Refresh token con rotación y revocación en cascada

Cada uso emite un nuevo refresh y revoca el anterior (almacenado en BD). Si se detecta reuso de un token ya revocado (posible robo), se revocan **todas** las sesiones del usuario, cerrando la ventana de ataque de token theft.

### Deduplicación de imágenes por hash SHA-256

La clave S3 es `tasks/{sha256(buffer)}.{ext}`. Antes de subir, `HeadObjectCommand` verifica si ya existe; si sí, se devuelve la URL existente sin re-subir. La misma imagen subida dos veces ocupa un solo objeto en S3.

### Limpieza de imágenes huérfanas

Al borrar una tarea o reemplazar su imagen, se cuenta cuántas otras tareas referencian la misma URL en BD. El objeto S3 solo se elimina cuando ese conteo llega a 0, evitando romper otras tareas que comparten la imagen (consecuencia de la deduplicación).

### Secretos: GitHub Secrets → Secrets Manager → ECS task `secrets`

Los secretos sensibles (DATABASE_URL, JWT, claves S3) nunca aparecen como `environment` en la task definition de ECS, donde serían visibles para cualquiera con permisos de `ecs:DescribeTaskDefinition`. En su lugar:

1. GitHub Secrets los envía al runner en memoria durante el deploy
2. El CI/CD los vuelca al secreto JSON `taskflow/prod` en Secrets Manager
3. La task definition los referencia con `"valueFrom": "<ARN>:clave::"` en el campo `secrets`
4. El ECS agent los inyecta como env vars del contenedor al arrancar la task

El execution role de ECS tiene un `secretsmanager:GetSecretValue` scoped al ARN de `taskflow/prod*`, por lo que ningún otro servicio en la cuenta puede leer ese secreto sin permiso explícito.

### 404, no 403, para tareas de otros usuarios

Un `403` confirmaría que el recurso existe y permitiría enumerar IDs ajenos. El `404` no filtra ninguna información.

### Sin `*` en CORS

La API viaja con credenciales (`withCredentials: true`). El navegador rechaza `Access-Control-Allow-Origin: *` cuando hay credenciales. El backend hace *origin echoing*: devuelve exactamente el origen de la petición si está en la lista permitida.

---

## 8. Capturas de pantalla

> Las capturas se añaden tras el primer despliegue en AWS.

| Vista | Descripción |
|---|---|
| `docs/screenshots/web-login.png` | Pantalla de login — SPA web |
| `docs/screenshots/web-tasks.png` | Lista de tareas con filtros y thumbnails |
| `docs/screenshots/web-task-form.png` | Formulario de creación con adjunto de imagen |
| `docs/screenshots/mobile-login.png` | Login en la app móvil |
| `docs/screenshots/mobile-tasks.png` | Lista de tareas en Ionic con thumbnail |
| `docs/screenshots/mobile-camera.png` | Modal de creación con opciones cámara / galería |

---

## 9. Limitaciones conocidas

- **Sin HTTPS en producción.** El ALB está en HTTP (puerto 80). Para producción real se requiere un certificado ACM y un listener HTTPS. Omitido por coste y alcance de la prueba.
- **Sin dominio personalizado.** La app se accede por el DNS del ALB. Un CNAME en Route 53 requeriría un dominio propio.
- **Build nativo de Android no automatizado.** El CI compila los assets web de Ionic pero no genera el APK/IPA. El build nativo requiere Android SDK + JDK en el runner de CI; para distribución real se usaría EAS Build.
- **Single AZ.** El servicio ECS usa subnets de la VPC por defecto, que pueden coincidir en una AZ. Para alta disponibilidad real se necesitarían subnets en ≥ 2 AZs.
- **Tests de integración diferidos.** Los tests unitarios y de integración del backend están pendientes por tiempo. La arquitectura hexagonal los facilita: los casos de uso son funciones puras que dependen de puertos, no de implementaciones concretas.
- **Límite de 5 MB por imagen.** Sin compresión en cliente. Podría añadirse `browser-image-compression` en web; `@capacitor/camera` ya permite configurar `quality` en mobile.
- **RDS en VPC diferente.** Si el usuario ya tenía una instancia RDS en la VPC por defecto, `setup.sh` imprime un aviso y propone las opciones (recrear la instancia en la VPC de TaskFlow, o configurar VPC Peering). El script no migra datos automáticamente.
