FROM node:20.10.0-alpine3.19

WORKDIR /app

COPY package.json .

RUN npm install -g $(node -p "require('./package.json').packageManager")

COPY . .

RUN pnpm install
RUN pnpm build

CMD ["pnpm", "start"]