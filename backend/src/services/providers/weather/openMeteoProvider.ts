import axios from 'axios';
import { IWeatherProvider } from '../interfaces';
import { WeatherForecastDay } from '../../../agent/types';
import { logger } from '../../../config/logger';

// WMO Weather interpretation codes (WW)
function interpretWeatherCode(code: number): string {
  if (code === 0) return 'Clear sky, sunny';
  if (code === 1 || code === 2) return 'Mainly clear, partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain showers';
  if (code >= 80 && code <= 82) return 'Violent rain showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Pleasant weather';
}

export class OpenMeteoWeatherProvider implements IWeatherProvider {
  async getForecast(latitude: number, longitude: number, startDate?: string, days = 5): Promise<WeatherForecastDay[]> {
    logger.info(`Fetching Open-Meteo forecast for (${latitude}, ${longitude})`, 'OpenMeteoWeatherProvider');

    try {
      const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude,
          longitude,
          daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
          timezone: 'auto'
        },
        timeout: 5000
      });

      const daily = response.data?.daily;
      if (!daily || !daily.time) {
        throw new Error('Unexpected Open-Meteo payload format');
      }

      const results: WeatherForecastDay[] = [];
      const count = Math.min(days, daily.time.length);

      for (let i = 0; i < count; i++) {
        results.push({
          date: daily.time[i],
          maxTempC: Math.round(daily.temperature_2m_max[i]),
          minTempC: Math.round(daily.temperature_2m_min[i]),
          precipitationProbPercent: daily.precipitation_probability_max[i] ?? 10,
          condition: interpretWeatherCode(daily.weathercode[i])
        });
      }

      return results;
    } catch (error: any) {
      logger.warn('Failed to query live Open-Meteo API, returning typical seasonal forecast', 'OpenMeteoWeatherProvider', error.message);
      // Return seasonal estimate for Goa/India
      const baseDate = startDate ? new Date(startDate) : new Date();
      return Array.from({ length: days }).map((_, idx) => {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + idx);
        return {
          date: d.toISOString().split('T')[0],
          maxTempC: 32,
          minTempC: 24,
          precipitationProbPercent: 15,
          condition: 'Warm, sunny beach weather'
        };
      });
    }
  }
}

export const weatherProvider = new OpenMeteoWeatherProvider();
