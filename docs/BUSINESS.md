# Dominio de negocio — TaskFlow

## Qué problema resuelve

TaskFlow es un gestor de tareas personales diseñado para que una persona organice su trabajo diario. El modelo es deliberadamente **privado y sin colaboración**: cada usuario gestiona solo sus propias tareas. No hay equipos, espacios compartidos ni permisos entre usuarios.

Esta decisión es intencional. La colaboración introduce complejidad sustancial (roles, permisos, notificaciones entre usuarios, conflictos de edición) que distrae del flujo central de valor: capturar, priorizar y completar trabajo. TaskFlow resuelve ese flujo central sin fricción.

El sistema tiene dos clientes: una SPA web para uso en escritorio y una app móvil para iOS/Android. Ambos acceden a los mismos datos a través de la misma API. Un usuario puede empezar una tarea desde el navegador y marcarla como completada desde el móvil.

---

## Entidades del dominio

### Usuario (`User`)

Representa a una persona registrada en el sistema. Es la raíz de todo: las tareas pertenecen a un usuario, las sesiones pertenecen a un usuario, no hay ningún objeto de valor en el sistema que no tenga un `userId` como propietario.

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| `id` | UUID | Generado por BD, inmutable |
| `name` | string | Nombre de presentación, máx. 100 chars |
| `email` | string | Único en todo el sistema, validado por Value Object `Email` |
| `passwordHash` | string | Hash bcrypt, validado por Value Object `PasswordHash` |
| `createdAt` | datetime | Inmutable, generado por BD |

El email es el identificador principal para login. Una vez creada la cuenta, el email no puede cambiarse (simplifica la lógica de búsqueda y revocación de sesiones).

El `passwordHash` es un Value Object que garantiza que lo que se almacena es un hash bcrypt válido, no una contraseña en claro ni un hash de otro tipo. Esto evita que un bug en el código almacene contraseñas legibles por accidente.

### Tarea (`Task`)

La unidad central de trabajo. Tiene ciclo de vida, prioridad y fecha límite opcional.

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| `id` | UUID | Generado por BD, inmutable |
| `userId` | UUID | FK al propietario, inmutable |
| `title` | string | Obligatorio, máx. 200 chars |
| `description` | string\|null | Opcional, máx. 2000 chars |
| `status` | enum | `PENDING` \| `COMPLETED`, default `PENDING` |
| `priority` | enum | `LOW` \| `MEDIUM` \| `HIGH`, default `MEDIUM` |
| `dueDate` | datetime\|null | Fecha límite opcional |
| `attachmentUrl` | string\|null | URL S3 de imagen adjunta, opcional |
| `createdAt` | datetime | Generado por BD |
| `updatedAt` | datetime | Actualizado por BD en cada cambio |

Una tarea siempre pertenece a exactamente un usuario. No puede transferirse entre usuarios. El `userId` se fija en la creación y no puede modificarse.

### Sesión / Refresh Token (`RefreshToken`)

Representa una sesión activa de un usuario. No es visible para el usuario directamente, pero controla cuántas sesiones simultáneas puede tener y permite revocarlas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador interno |
| `tokenHash` | string | HMAC-SHA256 del token opaco (nunca el token en claro) |
| `expiresAt` | datetime | Cuándo expira esta sesión (7 días por defecto) |
| `revokedAt` | datetime\|null | Si está revocado, cuándo se revocó |
| `deviceInfo` | string\|null | User-Agent recortado, para contexto |
| `userId` | UUID | El usuario al que pertenece |
| `createdAt` | datetime | Cuándo se creó la sesión |

Un usuario puede tener múltiples sesiones activas simultáneas (un navegador, un móvil, otro navegador). Cada `RefreshToken` representa una de ellas.

---

## Reglas de negocio

### Registro

Un usuario se registra con nombre, email y contraseña.

**Reglas:**
- El email debe ser válido (formato RFC 5322).
- La contraseña debe tener al menos 8 caracteres, una mayúscula y un dígito.
- El email debe ser único en el sistema. Si ya existe, se devuelve `EMAIL_ALREADY_EXISTS` (409).
- La detección de duplicado la hace la constraint `UNIQUE` de la base de datos, no una consulta previa. Esto elimina una race condition clásica: dos registros simultáneos con el mismo email donde ambos pasan el check pero uno falla al insertar. Con la constraint de BD, solo uno tiene éxito y el otro recibe el error correcto.

### Login

El usuario provee email y contraseña.

**Reglas:**
- Si el email no existe o la contraseña es incorrecta, el error siempre es `INVALID_CREDENTIALS` (401). Nunca se distingue entre "email no encontrado" y "contraseña incorrecta". Distinguirlos filtraría qué emails tienen cuenta registrada.
- Para que los tiempos de respuesta no filtren información (timing attack), si el email no existe o tiene formato inválido, el sistema ejecuta un hash bcrypt dummy con el mismo coste computacional que el hash real antes de responder. Esto hace que el tiempo de respuesta sea idéntico independientemente de si el email existe.
- Un login exitoso emite un par de tokens: access token (corta duración) y refresh token (larga duración). La sesión queda registrada en `RefreshToken`.

### Expiración y rotación de sesiones

El access token dura 15 minutos. Cuando expira, el cliente usa el refresh token para obtener un nuevo par.

**Reglas de rotación:**
- Cada uso del refresh token lo revoca y emite uno nuevo. Un refresh token se usa exactamente una vez.
- Si llega un refresh token que ya fue revocado (es decir, ya se usó), el sistema interpreta esto como un posible robo de token: alguien obtuvo un refresh token viejo y está intentando usarlo después de que el usuario legítimo ya lo renovó. En este caso, **todas las sesiones activas del usuario se revocan**. El usuario tiene que hacer login de nuevo. Es una respuesta agresiva pero segura: el daño de revocar sesiones legítimas es mucho menor que dejar activa una sesión comprometida.
- Los refresh tokens no son JWTs. Son valores opacos de 256 bits de aleatoriedad. No contienen información ni se pueden decodificar. Solo sirven como clave de búsqueda en la base de datos.

### Ownership de tareas

Cada operación sobre una tarea (leer, actualizar, eliminar) verifica que el `userId` del token coincide con el `userId` de la tarea.

**Regla de seguridad:** Si una tarea existe pero pertenece a otro usuario, el sistema devuelve `TASK_NOT_FOUND` (404), exactamente el mismo error que si la tarea no existiera. Devolver 403 ("existe pero no es tuya") filtraría la existencia del recurso, lo que tiene implicaciones de privacidad.

Esta verificación ocurre en el dominio con `task.assertOwnedBy(userId)`, no en el controlador ni en la query SQL. El controlador podría omitir la verificación por error; el dominio no.

### Ciclo de vida de una tarea

Una tarea nace en estado `PENDING`. El usuario puede cambiarla a `COMPLETED` y volver a `PENDING` cuantas veces quiera. No hay estados intermedios ni transiciones obligatorias.

La intención es mantener la herramienta simple. No hay "en progreso", "bloqueada", "esperando revisión". Estas abstracciones tienen valor en contextos de equipo; en un gestor personal añaden fricción sin beneficio.

### Prioridades

Las prioridades son `LOW`, `MEDIUM` (default) y `HIGH`. Son una señal subjetiva del usuario sobre qué hacer primero. El sistema no las enforza de ninguna manera: puedes completar una tarea `LOW` antes que una `HIGH`. Son solo un filtro y un indicador visual.

### Fechas límite

La `dueDate` es opcional y no tiene consecuencias automáticas. El sistema no cambia el estado de una tarea cuando pasa su fecha. No hay notificaciones automáticas de vencimiento (la app móvil puede mostrar notificaciones locales si el usuario lo configura, pero esto es una función del cliente, no del dominio).

Esta decisión es deliberada: las fechas que causan cambios de estado automáticos generan confusión ("¿por qué está marcada como vencida?") y requieren un sistema de jobs en background. La simplicidad tiene valor.

### Adjuntos de imagen

Una tarea puede tener una imagen adjunta (foto de un documento, captura de pantalla, etc.).

**Reglas:**
- Solo imágenes: JPEG, PNG o WebP.
- Tamaño máximo: 5 MB.
- Una tarea tiene como máximo un adjunto. Subir uno nuevo reemplaza el anterior.
- Las imágenes se almacenan en S3 usando la clave SHA-256 del contenido. Esto tiene dos consecuencias prácticas para el negocio:
  - **Deduplicación:** si dos usuarios suben la misma imagen (o el mismo usuario la sube dos veces), solo existe un objeto en S3. El almacenamiento no crece por duplicados.
  - **Limpieza segura:** cuando una tarea se elimina o su adjunto se reemplaza, el objeto S3 solo se borra si ninguna otra tarea lo referencia. Nunca se borra un objeto que alguien todavía usa.

### Filtros y búsqueda de tareas

El usuario puede filtrar su lista de tareas por:
- **Estado**: todas / pendientes / completadas
- **Prioridad**: todas / baja / media / alta
- **Búsqueda de texto**: búsqueda parcial en el título, sin distinguir mayúsculas/minúsculas
- **Paginación**: página y límite (máximo 100 por página)
- **Orden**: por fecha de creación, fecha límite o prioridad; ascendente o descendente

Todos los filtros se resuelven en SQL, no en memoria. Una lista con 10.000 tareas con filtros activos no carga las 10.000 en memoria para luego filtrar.

---

## Flujos principales

### Flujo de registro y primer uso

```
1. Usuario llena el formulario: nombre, email, contraseña.
2. POST /api/auth/register → se crea el usuario, se emite el par de tokens.
3. El cliente recibe la sesión y redirige a la lista de tareas (vacía).
4. No hay verificación de email, no hay tutorial obligatorio.
   El primer uso es inmediato.
```

### Flujo de login en web

```
1. POST /api/auth/login → { email, password }
2. Backend verifica credenciales, emite access_token y refresh_token
   como cookies httpOnly.
3. El acceso a rutas protegidas envía automáticamente las cookies
   (el navegador las gestiona).
4. Cuando el access_token expira, el interceptor de Angular captura el 401,
   llama a POST /api/auth/refresh (que envía el refresh_token via cookie),
   recibe un nuevo par de tokens, y reintenta la petición original
   sin que el usuario note nada.
5. Cuando el usuario cierra sesión, POST /api/auth/logout revoca
   el refresh_token y las cookies se eliminan.
```

### Flujo de login en móvil

```
1. POST /api/auth/login → { email, password }
2. Backend emite { accessToken, refreshToken } en el body JSON.
3. La app guarda ambos tokens en almacenamiento persistente
   (SharedPreferences / UserDefaults), cifrado por el sistema operativo.
4. Cada petición lleva Authorization: Bearer <accessToken>.
5. El interceptor gestiona el refresco igual que en web, pero leyendo
   y escribiendo en el almacenamiento local en lugar de cookies.
6. Al arrancar la app, se intenta rehidratar la sesión: si el accessToken
   está almacenado, se verifica. Si ha expirado, se refresca.
   Si el refresh falla, se redirige al login.
```

### Flujo de creación de tarea con adjunto (móvil)

```
1. Usuario abre el modal de nueva tarea.
2. Rellena título (obligatorio), descripción, prioridad, fecha límite.
3. Toca "Cámara" o "Galería" → se pide permiso la primera vez.
4. Se captura la imagen (o se selecciona de la galería).
5. Se muestra preview en el modal.
6. Al guardar:
   a. POST /api/tasks → { title, description, priority, dueDate }
      Respuesta: { data: { id, ... } }
   b. Si hay foto: POST /api/tasks/:id/attachment (multipart/form-data)
      La imagen se sube a S3. La tarea se actualiza con attachmentUrl.
7. La tarea aparece en la lista con su thumbnail.
```

---

## Decisiones de diseño con motivación

### Por qué no hay colaboración entre usuarios

La colaboración requiere un modelo de permisos (¿quién puede ver? ¿quién puede editar?), notificaciones entre usuarios, manejo de conflictos de edición y una UX completamente diferente. Eso es un producto distinto. TaskFlow es un gestor personal; la colaboración sería una distracción del flujo principal.

### Por qué no hay estados intermedios en las tareas

"En progreso", "bloqueada", "esperando revisión" tienen sentido en flujos de equipo. En uso personal, la pregunta que el usuario responde en cada tarea es binaria: ¿está hecha o no? Añadir estados intermedios aumenta la carga cognitiva de mantener el sistema actualizado, que es exactamente lo que un gestor de tareas debe minimizar.

### Por qué el refresh token no es un JWT

Un JWT contiene información que puede decodificarse sin ir a la BD. Para un refresh token, esto es una desventaja: si se compromete la clave de firma, todos los refresh tokens en circulación serían válidos. Un token opaco almacenado en BD es revocable individualmente y no porta información que pueda usarse si se intercepta.

### Por qué la imagen usa SHA-256 como clave S3

Una clave basada en UUID requeriría guardar la mapping UUID → archivo. Una clave basada en el contenido (SHA-256) elimina esa mapping: la clave es el contenido. La deduplicación es una consecuencia, no el objetivo principal. El objetivo es simplicidad: dado el archivo, siempre se puede calcular su key sin consultar ningún estado adicional.

### Por qué el error de ownership es 404 y no 403

Un 403 ("tienes permiso para ver esto, pero no para modificarlo") confirma que el recurso existe. En un sistema de gestión personal, confirmar que una tarea con cierto ID existe ya es información sensible: un atacante podría enumerar IDs para saber cuántas tareas tiene un usuario. El 404 uniforme elimina esta filtración.

### Por qué no hay seed de datos de demostración

La evaluación del sistema comienza en el registro. Si hubiera datos prellenados, el evaluador no ejercitaría el flujo de creación de cuenta ni el flujo completo de autenticación. El sistema sin seed obliga a recorrer el camino real del usuario desde el principio.

---

## Vocabulario del dominio

| Término | Definición |
|---------|------------|
| **Tarea** | Unidad de trabajo que el usuario quiere completar. |
| **Propietario** | El usuario que creó la tarea. No hay co-propietarios. |
| **Completar** | Cambiar el estado de `PENDING` a `COMPLETED`. |
| **Reabrir** | Cambiar el estado de `COMPLETED` a `PENDING`. |
| **Prioridad** | Señal subjetiva del usuario (LOW / MEDIUM / HIGH). El sistema no la enforza. |
| **Fecha límite** | Fecha objetivo opcional. No genera cambios automáticos. |
| **Adjunto** | Imagen asociada a la tarea. Una tarea tiene como máximo uno. |
| **Sesión** | Par access token + refresh token que acredita la identidad del usuario. |
| **Rotación** | Proceso de intercambiar un refresh token usado por uno nuevo. |
| **Reuso detectado** | Intento de usar un refresh token ya revocado. Activa la revocación total. |
