# ---------------------------------------------------------------------------
# Stage build: compila TypeScript y genera el Prisma client
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY . .
RUN npm run build

# Instala solo dependencias de producción en una carpeta aparte.
# npm ci con --prefix requiere que package.json y package-lock.json
# existan dentro del prefix — los copiamos antes de ejecutarlo.
RUN mkdir -p /app/prod_modules && \
    cp package.json package-lock.json /app/prod_modules/ && \
    npm ci --omit=dev --prefix /app/prod_modules

# ---------------------------------------------------------------------------
# Stage prod: imagen mínima de producción
# ---------------------------------------------------------------------------
FROM node:22-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production

# Solo lo necesario en runtime
COPY --from=build /app/dist ./dist
COPY --from=build /app/prod_modules/node_modules ./node_modules
# El Prisma Client generado vive en .prisma/client/ dentro del build stage.
# prod_modules solo tiene deps de producción sin regenerar; hay que copiarlo explícitamente.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./

# i18n assets — nest-cli.json los copia a dist/ durante el build
# (ya incluidos en dist/ del stage anterior)

EXPOSE 3000

# prisma migrate deploy aplica migraciones pendientes antes de arrancar.
# Si falla (DB no disponible, credencial incorrecta) el contenedor sale y ECS lo reintenta.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
