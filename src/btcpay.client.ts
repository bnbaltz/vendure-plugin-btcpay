import { AxiosInstance, AxiosResponse } from 'axios';
import { InvoiceInput, InvoiceResult } from './btcpay.types';
import { Logger } from '@vendure/core';
import { loggerCtx } from './constants';
const axios = require('axios').default;

export class BTCPayClient {
  private readonly client: AxiosInstance;

  constructor(private config: { apiKey: string; apiUrl: string; storeId: string;}) {
    this.client = axios.create({
      baseURL: this.config.apiUrl + '/api/v1/stores/' + this.config.storeId,
    });
    this.client.defaults.headers.common['Content-Type'] = 'application/json';
    this.client.defaults.headers.common['Authorization'] = 'token ' + this.config.apiKey;
  }

  async createInvoice(input: InvoiceInput): Promise<InvoiceResult> {
    const result = await this.client.post('/invoices', input);
    return this.validateResponse(result);
  }

  async getInvoice(id: string): Promise<InvoiceResult> {
    const result = await this.client.get(`/invoices/${id}`);
    return this.validateResponse(result);
  }

  private validateResponse(result: AxiosResponse): any {
    if (result.data.error) {
      Logger.error(
        `BTCPay call failed: ${result.data.error?.message}`,
        loggerCtx
      );
      throw Error(result.data.error?.message);
    }
    return result.data;
  }
}
