# frontend/Dockerfile
FROM node:18

WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 9001


CMD ["bash", "start.sh"]