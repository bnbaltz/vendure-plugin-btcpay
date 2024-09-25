import { Injectable } from '@nestjs/common';
import {
  ActiveOrderService,
  ChannelService,
  EntityHydrator,
  ErrorResult,
  Logger,
  OrderService,
  OrderStateTransitionError,
  PaymentMethodService,
  RequestContext,
} from '@vendure/core';
import { btcpayHandler } from './btcpay.handler';
import { loggerCtx } from './constants';
import { BTCPayClient } from './btcpay.client';
import { InvoiceConfirmedWebhookEvent } from './btcpay.types';

const crypto = require('crypto')
const bodyParser = require('body-parser')

@Injectable()
export class BTCPayService {
  constructor(
    private activeOrderService: ActiveOrderService,
    private orderService: OrderService,
    private channelService: ChannelService,
    private paymentMethodService: PaymentMethodService,
    private entityHydrator: EntityHydrator
  ) {}

  async createPaymentIntent(ctx: RequestContext): Promise<string> {
    const order = await this.activeOrderService.getOrderFromContext(ctx);
    if (!order) {
      throw Error('No active order found for session');
    }
    await this.entityHydrator.hydrate(ctx, order, {
      relations: ['lines', 'customer', 'shippingLines'],
    });
    if (!order.lines?.length) {
      throw Error('Cannot create payment intent for empty order');
    }
    if (!order.customer) {
      throw Error('Cannot create payment intent for order without customer');
    }
    if (!order.shippingLines?.length) {
      throw Error(
        'Cannot create payment intent for order without shippingMethod'
      );
    }
    const { apiKey, apiUrl, storeId, redirectUrl } = await this.getBTCPayPaymentMethod(ctx);
    const client = new BTCPayClient({ apiKey, apiUrl, storeId });
    const result = await client.createInvoice({
      amount: `${(order.totalWithTax / 100).toFixed(2)}`,
      currency: order.currencyCode,
      checkout: {
        redirectURL: `${redirectUrl}/${order.code}`
      }
    });
    return result.data.checkoutLink;
  }

  async settlePayment(
    event: InvoiceConfirmedWebhookEvent['event'], req
  ): Promise<void> {
    if (event?.type !== 'InvoiceSettled') {
      Logger.info(
        `Incoming webhook is of type ${event?.type} for order ${event?.data?.metadata?.orderCode}, not processing this event.`,
        loggerCtx
      );
      return;
    }
    if (
      !event.data?.metadata?.orderCode ||
      !event.data.metadata.channelToken ||
      !event.data.code
    ) {
      throw Error(
        `Incoming BTCPay webhook is missing metadata.orderCode, metadata.channelToken or code field: ${JSON.stringify(
          event.data?.metadata
        )}`
      );
    }
    const orderCode = event.data.metadata.orderCode;
    const ctx = new RequestContext({
      apiType: 'admin',
      isAuthorized: true,
      channel: await this.channelService.getChannelFromToken(
        event.data.metadata.channelToken
      ),
      authorizedAsOwnerOnly: false,
    });
    const { apiKey, apiUrl, storeId, secret, method } = await this.getBTCPayPaymentMethod(ctx);
    const sigHashAlg = 'sha256'
    const sigHeaderName = 'BTCPAY-SIG'
    if (!req.rawBody) {
      throw Error(
        `Webhook body empty, cannot check signature`
      );
    }
    const sig = Buffer.from(req.get(sigHeaderName) || '', 'utf8')
    const hmac = crypto.createHmac(sigHashAlg, secret)
    const digest = Buffer.from(
      sigHashAlg + '=' + hmac.update(req.rawBody).digest('hex'),
      'utf8'
    )
    const checksum = Buffer.from(sig, 'utf8')
    if (
      checksum.length !== digest.length ||
      !crypto.timingSafeEqual(digest, checksum)
    ) {
      throw Error(
        `Signature didn't match, possible attacker?`
      );
    }
    const client = new BTCPayClient({ apiKey, apiUrl, storeId });
    const invoice = await client.getInvoice(event.data.code);
    console.log(JSON.stringify(invoice));
    if (!invoice.data.confirmed_at) { // need to change
      Logger.error(
        `Requested charge ${event.data.code} does not have 'confirmed_at' on BTCPay. This payment will not be settled.`,
        loggerCtx
      );
      return;
    }
    const order = await this.orderService.findOneByCode(ctx, orderCode);
    if (!order) {
      throw Error(
        `Unable to find order ${orderCode}, unable to settle payment ${event.data.code}!`
      );
    }
    if (order.state !== 'ArrangingPayment') {
      const transitionToStateResult = await this.orderService.transitionToState(
        ctx,
        order.id,
        'ArrangingPayment'
      );
      if (transitionToStateResult instanceof OrderStateTransitionError) {
        throw Error(
          `Error transitioning order ${order.code} from ${transitionToStateResult.fromState} to ${transitionToStateResult.toState}: ${transitionToStateResult.message}`
        );
      }
    }
    const addPaymentToOrderResult = await this.orderService.addPaymentToOrder(
      ctx,
      order.id,
      {
        method: method.code,
        metadata: {
          id: event.id,
          code: event.data.code,
          addresses: event.data.addresses,
          metadata: event.data.metadata,
        },
      }
    );
    if ((addPaymentToOrderResult as ErrorResult).errorCode) {
      throw Error(
        `Error adding payment to order ${orderCode}: ${
          (addPaymentToOrderResult as ErrorResult).message
        }`
      );
    }
    Logger.info(`Payment for order ${orderCode} settled`, loggerCtx);
  }

  private async getBTCPayPaymentMethod(ctx: RequestContext) {
    let { items } = await this.paymentMethodService.findAll(ctx);
    const method = items.find(
      (item) => item.handler.code === btcpayHandler.code
    );
    if (!method) {
      throw Error(
        `No paymentMethod configured with handler ${btcpayHandler.code}`
      );
    }
    const apiKey = method.handler.args.find((arg) => arg.name === 'apiKey');
    const apiUrl = method.handler.args.find((arg) => arg.name === 'apiUrl');
    const storeId = method.handler.args.find((arg) => arg.name === 'storeId');
    const secret = method.handler.args.find((arg) => arg.name === 'secret');
    const redirectUrl = method.handler.args.find(
      (arg) => arg.name === 'redirectUrl'
    );
    if (!apiKey || !redirectUrl || !apiUrl || !storeId) {
      Logger.error(
        `CreatePaymentIntent failed, because no apiKey/apiUrl/storeId/secret/redirectUrl is configured for ${method.code}`,
        loggerCtx
      );
      throw Error(
        `Paymentmethod ${method.code} has no apiKey, apiUrl, storeId, secret, redirectUrl configured`
      );
    }
    return {
      apiKey: apiKey.value,
      apiUrl: apiUrl.value,
      storeId: storeId.value,
      secret: secret.value,
      redirectUrl: redirectUrl.value.endsWith('/')
        ? redirectUrl.value.slice(0, -1)
        : redirectUrl.value, // remove appending slash
      method,
    };
  }
}
