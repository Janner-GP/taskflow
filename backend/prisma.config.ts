import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Configuración del CLI de Prisma (migrate / studio / generate).
//
// Desde Prisma 7 la URL de conexión para migraciones ya no vive en el schema y
// el CLI tampoco carga `.env` por su cuenta: de ahí la llamada explícita.
//
// `dotenv` respeta el primer valor que encuentra y nunca pisa una variable ya
// presente en el entorno, así que el orden es: entorno real > `backend/.env` >
// `.env` de la raíz. Eso permite apuntar a `localhost:5432` en el loop nativo
// mientras el `.env` de la raíz mantiene `postgres:5432` para Docker.
loadEnv({ path: ['.env', '../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema/',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Se lee directo de `process.env` en vez de con el helper `env()` de Prisma
    // porque ese helper revienta si la variable no existe, y `prisma generate`
    // no necesita conexión: en CI se genera el client sin ninguna base de datos
    // a la vista. Los comandos que sí la necesitan (`migrate`, `studio`) fallan
    // igualmente con su propio mensaje si llega vacía.
    url: process.env.DATABASE_URL,
  },
});
