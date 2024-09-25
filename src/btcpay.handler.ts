import { LanguageCode } from '@vendure/common/lib/generated-types';
import {
  CreatePaymentErrorResult,
  CreatePaymentResult,
  CreateRefundResult,
  Logger,
  PaymentMethodHandler,
  SettlePaymentResult,
} from '@vendure/core';
import { loggerCtx } from './constants';

export const btcpayHandler = new PaymentMethodHandler({
  code: 'btcpay-payment-handler',
  description: [
    {
      languageCode: LanguageCode.en,
      value: 'BTCPay payment',
    },
  ],
  args: {
    apiKey: {
      type: 'string',
      label: [{ languageCode: LanguageCode.en, value: 'API Key' }],
    },
    apiUrl: {
      type: 'string',
      label: [{ languageCode: LanguageCode.en, value: 'BTCPay Instance URL' }],
    },
    storeId: {
      type: 'string',
      label: [{ languageCode: LanguageCode.en, value: 'BTCPay Store ID' }],
    },
    redirectUrl: {
      type: 'string',
      label: [{ languageCode: LanguageCode.en, value: 'Redirect URL' }],
      description: [
        {
          languageCode: LanguageCode.en,
          value: 'Redirect the client to this URL after payment',
        },
      ],
    },
  },
  createPayment: async (
    ctx,
    order,
    amount,
    args,
    metadata
  ): Promise<CreatePaymentResult | CreatePaymentErrorResult> => {
    // Creating a payment immediately settles the payment, so only Admins and internal calls should be allowed to do this
    if (ctx.apiType !== 'admin') {
      throw Error(`CreatePayment is not allowed for apiType '${ctx.apiType}'`);
    }
    return {
      amount,
      state: 'Settled' as const,
      transactionId: metadata.paymentId,
      metadata, // Store all given metadata on a payment
    };
  },
  settlePayment: async (): Promise<SettlePaymentResult> => {
    return { success: true };
  },
  createRefund: async (
    ctx,
    input,
    amount,
    order,
    payment
  ): Promise<CreateRefundResult> => {
    Logger.warn(
      `This plugin does not support refunds. You need to manually refund ${payment.transactionId} via BTCPay`,
      loggerCtx
    );
    return {
      state: 'Failed',
      metadata: {
        public: {
          message: `This plugin does not support refunds. You need to manually refund ${payment.transactionId} via BTCPay`,
        },
      },
    };
  },
});
