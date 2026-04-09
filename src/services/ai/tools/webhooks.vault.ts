import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { logger } from '../../../utils/logger.js';

const log = logger.child({ service: 'WebhooksVault' });

const sendSMSInputSchema = z.object({
  phoneNumber: z.string().describe('Recipient phone number (international format)'),
  message: z.string().describe('Message content (max 160 characters)'),
  tenantId: z.string().describe('The tenant ID'),
});

type SendSMSInput = z.infer<typeof sendSMSInputSchema>;

/**
 * send_sms_notification
 * Facade tool for sending SMS via Termii/Twilio.
 * 
 * [SECURITY]: The LLM never sees the API key; it only provides the recipient and message.
 */
export const sendSMSNotificationTool = (env: Record<string, string | undefined>) => 
  createTool({
    id: 'send_sms_notification',
    description: 'Send an SMS notification to a specific phone number.',
    inputSchema: sendSMSInputSchema,
    execute: async ({ input }: { input: SendSMSInput }) => {
      const { phoneNumber, message, tenantId } = input;

      const apiKey = env?.TERMII_API_KEY;
      if (!apiKey) throw new Error('TERMII_API_KEY is not configured in this environment.');

      log.info('Sending SMS via Termii Facade', { tenantId, to: phoneNumber });

      const apiResponse = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phoneNumber,
          from: env.TERMII_SENDER_ID || 'EdApex',
          sms: message,
          type: 'plain',
          channel: 'generic',
          api_key: apiKey,
        }),
      });

      if (!apiResponse.ok) {
        throw new Error(`Termii SMS failed: ${await apiResponse.text()}`);
      }

      return {
        success: true,
        message: `SMS queued for delivery to ${phoneNumber}.`,
        provider: 'termii',
      };
    },
  });

const createPaymentInputSchema = z.object({
  amountCents: z.number().positive().describe('Amount in cents'),
  currency: z.string().default('USD'),
  description: z.string().describe('Description of the payment purpose'),
  metadata: z.record(z.string(), z.string()).optional(),
});

type CreatePaymentInput = z.infer<typeof createPaymentInputSchema>;

/**
 * create_payment_link
 * Facade tool for generating a Stripe payment link for school fees.
 */
export const createPaymentLinkTool = (env: Record<string, string | undefined>) => 
  createTool({
    id: 'create_payment_link',
    description: 'Generate a secure payment link for school fees or library overdue fines.',
    inputSchema: createPaymentInputSchema,
    execute: async ({ input }: { input: CreatePaymentInput }) => {
      const { amountCents, currency, description, metadata } = input;

      const stripeKey = env?.STRIPE_SECRET_KEY;
      if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not configured.');

      log.info('Generating Stripe Payment Link', { amountCents, currency });

      const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'success_url': env.STRIPE_SUCCESS_URL || 'https://edapex.com/success',
          'cancel_url': env.STRIPE_CANCEL_URL || 'https://edapex.com/cancel',
          'line_items[0][price_data][currency]': currency.toLowerCase(),
          'line_items[0][price_data][product_data][name]': description,
          'line_items[0][price_data][unit_amount]': amountCents.toString(),
          'line_items[0][quantity]': '1',
          'mode': 'payment',
          ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
        }),
      });

      if (!stripeResponse.ok) {
        throw new Error(`Stripe Payment failed: ${await stripeResponse.text()}`);
      }

      const checkoutSession = (await stripeResponse.json()) as { url: string };

      return {
        success: true,
        paymentUrl: checkoutSession.url,
        status: 'pending',
      };
    },
  });
