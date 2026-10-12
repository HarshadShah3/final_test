import { createApp } from './app.js';
const serverPort = Number(process.env.PORT) || 3001;
createApp().listen(serverPort, () => console.log(`Regional Futures API listening on http://localhost:${serverPort}`));
