FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json server.ts ./
COPY src ./src
RUN npm install --include=dev
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN npm install --omit=dev
EXPOSE 8787
CMD ["node", "./dist/server.js"]
