import {
  PluginCommonModule,
  RuntimeVendureConfig,
  VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';
import { BTCPayController, BTCPayResolver } from './btcpay.controller';
import { btcpayHandler } from './btcpay.handler';
import { BTCPayService } from './btcpay.service';

@VendurePlugin({
  imports: [PluginCommonModule],
  controllers: [BTCPayController],
  providers: [BTCPayService],
  shopApiExtensions: {
    schema: gql`
      extend type Mutation {
        createBTCPayPaymentIntent: String!
      }
    `,
    resolvers: [BTCPayResolver],
  },
  compatibility: '>=2.2.0',
  configuration: (config: RuntimeVendureConfig) => {
    config.paymentOptions.paymentMethodHandlers.push(btcpayHandler);
    return config;
  },
})
export class BTCPayPlugin {}
