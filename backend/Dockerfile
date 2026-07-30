# ---------------------------------------------------------------------------
# Stage build: compila TypeScript y genera el Prisma client
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# Instala solo dependencias de producción en una carpeta aparte
RUN npm ci --omit=dev --prefix /app/prod_modules

# ---------------------------------------------------------------------------
# Stage prod: imagen mínima de producción
# ---------------------------------------------------------------------------
FROM node:22-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production

# Solo lo necesario en runtime
COPY --from=build /app/dist ./dist
COPY --from=build /app/prod_modules/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma

# i18n assets — nest-cli.json los copia a dist/ durante el build
# (ya incluidos en dist/ del stage anterior)

EXPOSE 3000

CMD ["node", "dist/main.js"]
