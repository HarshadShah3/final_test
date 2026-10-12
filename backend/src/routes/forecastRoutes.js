import { Router } from 'express';
import { DatabaseUnavailableError, getAivenHealth } from '../database/aivenClient.js';
import { ForecastRequestError, getRegionalForecasts } from '../services/forecastService.js';

export const forecastRouter = Router();

forecastRouter.get('/health', async (_request, response) => {
  try {
    const health = await getAivenHealth();
    response.status(health.connected ? 200 : 503).json(health);
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return response.status(503).json({ configured: true, connected: false, message: error.message });
    }
    throw error;
  }
});

forecastRouter.get('/regions', async (request, response) => {
  try {
    response.json(await getRegionalForecasts(request.query.regionIds));
  } catch (error) {
    if (error instanceof ForecastRequestError) {
      return response.status(400).json({ message: error.message });
    }
    if (error instanceof DatabaseUnavailableError) {
      return response.status(503).json({ message: error.message });
    }
    throw error;
  }
});
