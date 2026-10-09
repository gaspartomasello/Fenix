# Imagen del servidor de Fenix: compila cliente y servidor, y corre solo lo necesario.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/art/package.json packages/art/
COPY packages/content/package.json packages/content/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
# El servidor compilado es un solo archivo; de node_modules solo usa `ws`.
COPY --from=build /app/node_modules/ws node_modules/ws
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/client/dist packages/client/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "packages/server/dist/main.js"]
