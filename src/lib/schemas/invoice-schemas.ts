import { z } from 'zod';

import {
  DateStringSchema,
  IdSchema,
  MoneySchema,
  NonEmptyStringSchema,
  OptionalStringSchema,
} from './common';

export const InvoiceLineSchema = z
  .object({
    line_number: z.number().int().positive('Line number must be a positive integer'),
    description: NonEmptyStringSchema,
    quantity: z.number().positive('Quantity must be greater than 0'),
    unit_price: MoneySchema,
    amount: MoneySchema,
    is_tax_inclusive: z.boolean().optional(),
    tax_code_id: IdSchema.optional(),
    account_id: IdSchema.optional(),
  })
  .strict();

export const InvoiceInputSchema = z
  .object({
    invoice_number: NonEmptyStringSchema,
    contact_id: IdSchema,
    issue_date: DateStringSchema,
    due_date: DateStringSchema,
    tax_code_id: IdSchema.optional(),
    notes: OptionalStringSchema,
  })
  .strict()
  .refine((data) => data.due_date >= data.issue_date, {
    message: 'Due date must be on or after issue date',
    path: ['due_date'],
  });

export type InvoiceInput = z.infer<typeof InvoiceInputSchema>;
export type InvoiceLineInput = z.infer<typeof InvoiceLineSchema>;
