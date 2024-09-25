import { Body, Controller, Post } from '@nestjs/common';
import { Resolver, Mutation } from '@nestjs/graphql';
import { BTCPayService } from './btcpay.service';
import { Ctx, Logger, RequestContext } from '@vendure/core';
import { InvoiceConfirmedWebhookEvent } from './btcpay.types';
import { loggerCtx } from './constants';

@Controller('payments')
export class BTCPayController {
  constructor(private service: BTCPayService) {}

  @Post('btcpay')
  async webhook(@Body() body: InvoiceConfirmedWebhookEvent, @Req() req): Promise<void> {
    try {
      await this.service.settlePayment(body.event, req);
    } catch (error: any) {
      Logger.error(
        `Failed to process incoming webhook: ${
          error?.message
        }: ${JSON.stringify(body)}`,
        loggerCtx,
        error
      );
      throw error;
    }
  }
}

@Resolver()
export class BTCPayResolver {
  constructor(private service: BTCPayService) {}

  @Mutation()
  createBTCPayPaymentIntent(@Ctx() ctx: RequestContext): Promise<string> {
    return this.service.createPaymentIntent(ctx);
  }
}
