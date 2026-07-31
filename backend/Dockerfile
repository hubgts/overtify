# syntax=docker/dockerfile:1

# ==============================================================================
# Étape 1 — dépendances de build (dev incluses, nécessaires à tsc)
# ==============================================================================
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ==============================================================================
# Étape 2 — compilation TypeScript
# ==============================================================================
FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

RUN npm run build

# ==============================================================================
# Étape 3 — image d'exécution
#
# Seules les dépendances de production et le JavaScript compilé sont
# embarqués : ni sources TypeScript, ni outillage de build.
# ==============================================================================
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Répertoires de données et de logs, créés avant le passage en utilisateur
# non-root pour que les volumes montés soient accessibles en écriture.
RUN mkdir -p /app/data /app/logs && chown -R node:node /app/data /app/logs

# Exécution sans privilèges root (l'image node fournit l'utilisateur `node`).
USER node

EXPOSE 3001

# Sonde de vie interrogeant la route de santé de l'application.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
