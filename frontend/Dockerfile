# syntax=docker/dockerfile:1

# ==============================================================================
# Étape 1 — build du bundle statique
# ==============================================================================
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
# Fichiers statiques copiés tels quels par Vite (favicons, manifeste).
COPY public ./public

RUN npm run build

# ==============================================================================
# Étape 2 — service des fichiers statiques par Nginx
#
# Nginx sert le bundle et proxifie /api vers le backend : le navigateur ne voit
# qu'une seule origine, ce qui supprime toute problématique de CORS et de
# cookie cross-site en production.
# ==============================================================================
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
