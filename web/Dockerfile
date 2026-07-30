# ---------------------------------------------------------------------------
# Stage build: compila la SPA de Angular
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage prod: nginx sirve la SPA y hace proxy de /api al backend
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS prod

# El build de Angular escribe en dist/web/browser (Angular 21 esbuild)
COPY --from=build /app/dist/web/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
