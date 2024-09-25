# Vendure BTCPay plugin

Accept crypto payments via BTCPay in Vendure.

## Getting started

Add the plugin to your `vendure-config.ts`:

```ts
import { BTCPayPlugin } from "@bnbaltz/vendure-plugin-btcpay"


plugins: [
  BTCPayPlugin,
  ...
  ];
```

### 2. Set API key in Vendure

1. Start your server
2. Go to the Admin UI > Settings > Payment methods and add a payment method with handler `btcpay-payment-handler`
3. Set your BTCPay API key, base URL, store ID and secret. These can be found on your BTCPay instance
4. Set your desired storefront redirectUrl, something like `https://storefront/order/`. Your customer will be redirected
   to this page + order code: `https://storefront/order/897HH7HG7`
5. Save the payment method

### 3. Set webhook in BTCPay

1. Go to Settings > Webhooks on your BTCPay instance
2. Add a new webhook with endpoint `https://<your-vendure-server>/payments/btcpay`
3. Click specific notifications and check the box for `invoice settled`

### 4. Storefront usage

You can now call the mutation `createBTCPayPaymentIntent` to get a redirectUrl to the BTCPay hosted checkout page.
You can redirect your customer to this URL, so your customer can continue making a payment on the BTCPay platform.
After payment the customer will be redirected to `https://storefront/order/897HH7HG7`

## Notes

- Orders are NOT transitioned to `PaymentSettled` directly after BTCPay redirects the customer to the confirmation page, because
  crypto transactions can take some time to confirm. You should notify your customer with a message that the order will be
  handled when their transaction is confirmed. This can take a few minutes.

- Refunds are not supported. If you want to refund a payment done via BTCPay you need to manually do so. This plugin will not do refunds.
