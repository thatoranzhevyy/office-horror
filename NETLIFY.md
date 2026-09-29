# Деплой на Netlify

Этот репозиторий готов для деплоя фронтенда на Netlify через `netlify.toml`.

## Важно про WebSocket-сервер

Игра использует WebSocket-сервер из `server/index.ts`. Netlify подходит для статического фронтенда, но не запускает такой постоянный Node/WebSocket-процесс. Поэтому для полной мультиплеерной игры нужно:

1. Задеплоить backend отдельно на сервис с постоянным Node-процессом, например Render, Railway, Fly.io, VPS или Docker-хостинг.
2. В Netlify указать переменную окружения `VITE_WS_URL` со значением WebSocket-адреса backend, например:

```text
wss://your-backend.example.com/ws
```

Если `VITE_WS_URL` не задан, клиент будет пытаться подключиться к `/ws` на том же домене. Это удобно для локального запуска через `npm start`, но на чистом Netlify работать не будет.

Не настраивайте WebSocket через Netlify redirect/proxy. Для WebSocket нужен прямой адрес backend вида `wss://.../ws`. Netlify proxy redirects рассчитаны на HTTP-запросы и не подходят как постоянный WebSocket-туннель.

Если сайт Netlify открыт по HTTPS, backend тоже должен быть доступен по защищённому WebSocket:

```text
Правильно:   wss://your-backend.example.com/ws
Неправильно: ws://your-backend.example.com/ws
```

Адрес backend должен отвечать на путь `/ws`, потому что сервер в проекте слушает именно этот путь.

## Настройки Netlify

В панели Netlify откройте **Site configuration → Build & deploy → Build settings** и укажите:

```text
Build command: npm run build
Publish directory: dist
```

Node.js:

```text
NODE_VERSION: 22.12.0
```

Environment variables:

```text
VITE_WS_URL: wss://адрес-вашего-backend/ws
```

После изменения `VITE_WS_URL` сделайте новый deploy. Vite подставляет переменные `VITE_*` во время сборки.

## Настройки backend-хостинга

Для отдельного Node-хоста используйте:

```text
Build command: npm ci
Start command: npm start
Node version: 22.12.0 или новее
```

Переменные backend:

```text
PORT: обычно хостинг выставляет сам
TEAM_SIZE: 2
```

Если хостинг ставит зависимости только в production-режиме, убедитесь, что пакет `tsx` тоже установлен, потому что текущая команда `npm start` запускает TypeScript-сервер через `node --import tsx server/index.ts`.

## Как залить

Вариант через Git:

1. Загрузите проект в GitHub/GitLab/Bitbucket.
2. В Netlify нажмите **Add new site → Import an existing project**.
3. Выберите репозиторий.
4. Netlify подхватит `netlify.toml`; проверьте, что команда сборки `npm run build`, а папка публикации `dist`.
5. Добавьте `VITE_WS_URL` в **Environment variables**.
6. Нажмите **Deploy**.

Вариант вручную:

1. Локально выполните:

```bash
npm ci
npm run build
```

2. В Netlify откройте **Sites → Add new site → Deploy manually**.
3. Перетащите папку `dist`.

Ручной вариант публикует только фронтенд. Для игры с мультиплеером всё равно нужен внешний backend и сборка с заданным `VITE_WS_URL`.
