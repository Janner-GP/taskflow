# TaskFlow — Contrato de API

> Documento de alineación entre los proyectos `backend/`, `web/` y `mobile/`.
> **No es la especificación ejecutable.** El OpenAPI real lo genera NestJS desde los
> decoradores `@ApiProperty` y se sirve en `/api/docs`. Si algo difiere, manda el código.
>
> Web y mobile son proyectos independientes sin código compartido: este archivo es lo
> único que garantiza que ambos hablen el mismo idioma con la API.

Base path: `/api` · Todas las respuestas son `application/json`.

---

## Modelos

```ts
type Priority   = 'LOW' | 'MEDIUM' | 'HIGH'
type TaskStatus = 'PENDING' | 'COMPLETED'

interface User {
  id: string          // uuid
  name: string
  email: string
  createdAt: string   // ISO 8601
}

interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: Priority
  dueDate: string | null      // ISO 8601
  attachmentUrl: string | null
  createdAt: string
  updatedAt: string
}
```

`userId` **nunca** viaja en las respuestas: el dueño se deduce del token. Un cliente no
tiene forma de pedir tareas de otro usuario porque el filtro no es un parámetro.

---

## Autenticación — dos transportes, un mismo dominio

| | Web | Mobile |
|---|---|---|
| Transporte | Cookies `httpOnly` `Secure` `SameSite=Lax` | `Authorization: Bearer <token>` |
| Cómo lo pide | header `X-Client: web` (por defecto) | header `X-Client: mobile` |
| Respuesta de login | `Set-Cookie` + body `{ user }` | body `{ user, accessToken, refreshToken }` |
| CSRF | cookie `XSRF-TOKEN` + header `X-XSRF-TOKEN` | no aplica |

El backend resuelve el transporte según `X-Client`. **Un solo caso de uso, dos adaptadores.**
Si el header falta, se asume `web` (el default más seguro: no devuelve tokens en el body).

### CSRF (solo web) — double-submit

El backend emite una cookie **`XSRF-TOKEN`** legible por JS (`httpOnly: false`, que es el
punto: el cliente tiene que poder leerla) en cualquier respuesta donde no exista todavía.
En cada petición **mutante** (`POST`, `PATCH`, `PUT`, `DELETE`) exige el header
**`X-XSRF-TOKEN`** con ese mismo valor; si falta o no coincide → `403 CSRF_TOKEN_INVALID`.

Funciona porque un atacante en otro origen puede *provocar* que el navegador envíe la
cookie, pero **no puede leerla** para copiarla al header (lo impide la same-origin policy).

Los clientes mobile (`X-Client: mobile`) están exentos: sin cookies no hay CSRF.
Angular lo implementa de forma nativa con `withXsrfConfiguration`, así que la web no
escribe código para esto.

**`/auth/login` y `/auth/register` también están exentos.** El double-submit exige leer
una cookie `XSRF-TOKEN` que un cliente nuevo todavía no tiene — exigirla ahí bloquearía el
arranque en frío para siempre. Es seguro porque ninguno de los dos opera sobre una sesión
existente, y `SameSite=Lax` ya cubre el CSRF de login. `refresh` y `logout` sí la exigen,
porque ahí ya hay sesión que proteger.

### CORS — dos orígenes en desarrollo

`CORS_ORIGIN` es una **lista separada por comas**, nunca un wildcard (la API viaja con
credenciales y el navegador rechaza `*` junto a cookies). En desarrollo lleva los dos
dev servers a la vez:

```
CORS_ORIGIN=http://localhost:4200,http://localhost:4201
```

| Puerto | Quién |
|---|---|
| `4200` | `ng serve` — web |
| `4201` | `ionic serve` — mobile en navegador (el emulador Android no pasa por CORS: es un WebView, no un origen de navegador) |

El backend hace *origin echoing*: responde con el origen exacto de la petición si está en
la lista, nunca con la lista completa ni con `*`. Un origen fuera de la lista no recibe
`Access-Control-Allow-Origin` y el navegador bloquea la respuesta.

En el stack dockerizado de producción la web es same-origin (nginx la sirve y proxea
`/api`), así que ahí `CORS_ORIGIN` prácticamente no se ejercita.

### Sin datos semilla

No hay seed ni usuario demo: quien evalúe se registra. El flujo de registro queda así
ejercitado desde el primer uso.

### `POST /api/auth/register`
```ts
// request
{ name: string, email: string, password: string }   // password mín. 8, 1 mayúscula, 1 dígito
// 201 → igual que login
```

### `POST /api/auth/login`
```ts
{ email: string, password: string }
// 200 web    → { user: User }                                  + Set-Cookie
// 200 mobile → { user: User, accessToken, refreshToken }
// 401        → credenciales inválidas (mensaje genérico, no revela si el email existe)
```

### `POST /api/auth/refresh`
```ts
// web    → sin body (o body vacío), lee la cookie de refresh
// mobile → { refreshToken: string }
// 200 → nuevo par de tokens (rotación: el refresh usado queda revocado)
// 401 → refresh inválido, expirado o ya revocado
//        (reuso de un refresh ya revocado revoca TODAS las sesiones del usuario)
```
`refreshToken` en el body es **opcional** en el DTO: si viaja se usa (mobile), si no se
lee la cookie (web). Mandarlo con `X-Client: web` no es un error, pero se ignora.

### `POST /api/auth/logout`
```ts
// web    → sin body, lee la cookie de refresh
// mobile → { refreshToken: string }   (mismo campo opcional que /auth/refresh)
// 204 siempre, aunque no hubiera sesión
```
Web: además borra las cookies de sesión. Mobile: revoca el refresh recibido.

### `GET /api/auth/me`
`200 → { user: User }`. **Es como la web rehidrata la sesión al arrancar**, porque con
cookies `httpOnly` el JWT no es legible desde JS. `401` si no hay sesión válida.

---

## Tareas — todas requieren autenticación

### `GET /api/tasks`

| Query param | Tipo | Notas |
|---|---|---|
| `status` | `TaskStatus` | opcional |
| `priority` | `Priority` | opcional |
| `search` | `string` | busca en el título, case-insensitive, parcial |
| `page` | `number` | por defecto `1` |
| `limit` | `number` | por defecto `20`, máximo `100` |
| `sortBy` | `createdAt` \| `dueDate` \| `priority` | por defecto `createdAt` |
| `sortDir` | `asc` \| `desc` | por defecto `desc` |

```ts
// 200
{
  data: Task[],
  meta: { page: number, limit: number, total: number, totalPages: number }
}
```
Filtros, búsqueda, orden y paginación se resuelven **en SQL**, no en memoria.

### `POST /api/tasks`
```ts
{ title: string, description?: string, priority: Priority, dueDate?: string }
// 201 → Task
```

### `GET /api/tasks/:id` → `200 → Task`

### `PATCH /api/tasks/:id`
```ts
// todos los campos opcionales; también es el endpoint para completar/reabrir
{ title?, description?, priority?, dueDate?, status? }
// 200 → Task
```

### `DELETE /api/tasks/:id` → `204`

**Aislamiento entre usuarios:** pedir, editar o borrar una tarea de otro usuario devuelve
**`404`, no `403`**. Un `403` confirmaría que el recurso existe; el `404` no filtra nada.

---

## Formato de error

Uniforme para toda la API, desde un exception filter centralizado:

```ts
{
  statusCode: number,
  code: string,        // 'VALIDATION_ERROR' | 'INVALID_CREDENTIALS' | 'TASK_NOT_FOUND' | ...
  message: string,     // legible, en español
  details?: unknown,   // errores de validación campo a campo
  timestamp: string,
  path: string
}
```

Los clientes se ramifican por **`code`**, nunca por `message` — el texto puede cambiar o
traducirse, el código no.

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | DTO inválido; `details` trae los campos |
| `INVALID_CREDENTIALS` | 401 | login fallido |
| `UNAUTHENTICATED` | 401 | sin token, expirado o inválido → dispara el refresh en el cliente |
| `EMAIL_ALREADY_EXISTS` | 409 | registro con email ya usado |
| `TASK_NOT_FOUND` | 404 | no existe **o es de otro usuario** |
| `CSRF_TOKEN_INVALID` | 403 | falta o no coincide `X-XSRF-TOKEN` en una petición mutante (solo web) |
| `TOO_MANY_REQUESTS` | 429 | rate limit en `/auth/*` |
| `NOT_FOUND` | 404 | ruta inexistente — **también** con este formato, no el 404 por defecto de Nest |
| `INTERNAL_ERROR` | 500 | fallo no previsto; nunca expone el stack |
