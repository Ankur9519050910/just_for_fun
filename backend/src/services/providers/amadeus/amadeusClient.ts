import axios, { AxiosInstance } from 'axios';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';

export class AmadeusClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private readonly baseUrl: string;

  constructor() {
    // Amadeus Self-Service Test Sandbox Endpoint
    this.baseUrl = 'https://test.api.amadeus.com';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 12000
    });
  }

  public isConfigured(): boolean {
    return Boolean(env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET);
  }

  public async getAccessToken(): Promise<string> {
    const now = Date.now();
    // Use cached token if valid for at least 60 seconds
    if (this.accessToken && this.tokenExpiresAt > now + 60000) {
      return this.accessToken;
    }

    if (!this.isConfigured()) {
      throw new Error('Amadeus credentials not configured (AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET missing)');
    }

    try {
      logger.info('Authenticating with Amadeus OAuth2 endpoint...', 'AmadeusClient');
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', env.AMADEUS_CLIENT_ID);
      params.append('client_secret', env.AMADEUS_CLIENT_SECRET);

      const response = await axios.post(`${this.baseUrl}/v1/security/oauth2/token`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 8000
      });

      this.accessToken = response.data.access_token;
      // Expires_in is in seconds
      this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
      logger.info('Successfully obtained Amadeus access token', 'AmadeusClient');
      return this.accessToken!;
    } catch (error: any) {
      const errDetails = error.response?.data || error.message;
      logger.error('Failed to obtain Amadeus access token', 'AmadeusClient', errDetails);
      throw new Error(`Amadeus Authentication Failed: ${JSON.stringify(errDetails)}`);
    }
  }

  public async get(endpoint: string, params: Record<string, unknown> = {}): Promise<any> {
    const token = await this.getAccessToken();
    try {
      const response = await this.client.get(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params
      });
      return response.data;
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data;
      logger.error(`Amadeus GET ${endpoint} failed [HTTP ${status}]`, 'AmadeusClient', data);
      throw error;
    }
  }
}

export const amadeusClient = new AmadeusClient();
