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

CMD ["npm", "run", "start"]
