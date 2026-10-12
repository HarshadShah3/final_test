import serverless from 'serverless-http';
import { createApp } from '../../backend/src/app.js';

export const handler = serverless(createApp());
