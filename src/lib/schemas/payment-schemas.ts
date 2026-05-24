import { z } from 'zod';

import {
  DateStringSchema,
  IdSchema,
  MoneySchema,
  NonEmptyStringSchema,
  OptionalStringSchema,
} from './common';

export const PaymentMethodSchema = z.enum(['cash', 'check', 'transfer', 'card', 'other']);

export const PaymentAllocationSchema = z
  .object({
    invoice_id: IdSchema,
    amount: MoneySchema,
  })
  .strict();

export const PaymentInputSchema = z
  .object({
    payment_number: NonEmptyStringSchema,
    contact_id: IdSchema.optional(),
    payment_date: DateStringSchema,
    amount: MoneySchema,
    payment_method: PaymentMethodSchema,
    reference: OptionalStringSchema,
    notes: OptionalStringSchema,
  })
  .strict();

export type PaymentInput = z.infer<typeof PaymentInputSchema>;
export type PaymentAllocationInput = z.infer<typeof PaymentAllocationSchema>;
