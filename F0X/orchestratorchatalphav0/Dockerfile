FROM node:20-bullseye-slim

WORKDIR /app

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]

