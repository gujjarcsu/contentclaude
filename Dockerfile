# Phase 1 item 3 — Node 20 reached end of life, so it stops getting security
# patches; 22 is the current LTS and is inside the engines range in package.json.
FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install all deps (including dev) so prisma generate can run during build
RUN npm ci && npm cache clean --force

COPY . .

# Generate Prisma client, then build the app
RUN npx prisma generate && npm run build

# Remove dev dependencies after build to keep image lean
RUN npm prune --omit=dev

# Bake the git SHA of this build into the image so /api/build-info can prove
# exactly which commit production is serving. CI passes --build-arg GIT_SHA=<sha>.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

# Phase 1 item 3 — drop root. Everything above this line needs write access to
# /app to install and build; nothing below it does. The `node` user ships with
# the base image, so this costs nothing, and it means a process escape does not
# begin as root. Ownership is handed over after the build because the runtime
# still reads from /app: the generated Prisma client, and prisma/migrations,
# which the release command applies.
RUN chown -R node:node /app
USER node

CMD ["npm", "run", "start"]
