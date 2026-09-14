FROM node:22-bookworm-slim AS ui-builder
WORKDIR /build/ui
COPY document-rag-ui/package*.json ./
RUN npm ci
COPY document-rag-ui/ ./
RUN npm run build

FROM node:22-bookworm-slim AS api-builder
WORKDIR /build/api
COPY document-rag/package*.json ./
RUN npm ci
COPY document-rag/ ./
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY document-rag/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=api-builder /build/api/dist ./dist
COPY --from=ui-builder /build/ui/dist ./public
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
