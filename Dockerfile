FROM node:20-alpine
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

CMD ["npm", "run", "start"]
