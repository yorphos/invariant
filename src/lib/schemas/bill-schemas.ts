import { z } from 'zod';

import {
  DateStringSchema,
  IdSchema,
  MoneySchema,
  NonEmptyStringSchema,
  OptionalStringSchema,
} from './common';

export const BillLineSchema = z
  .object({
    line_number: z.number().int().positive('Line number must be a positive integer'),
    description: NonEmptyStringSchema,
    quantity: z.number().positive('Quantity must be greater than 0'),
    unit_price: MoneySchema,
    amount: MoneySchema,
    account_id: IdSchema,
    item_id: IdSchema.optional(),
  })
  .strict();

export const BillInputSchema = z
  .object({
    bill_number: NonEmptyStringSchema,
    vendor_id: IdSchema,
    bill_date: DateStringSchema,
    due_date: DateStringSchema,
    tax_code_id: IdSchema.optional(),
    reference: OptionalStringSchema,
    notes: OptionalStringSchema,
  })
  .strict()
  .refine((data) => data.due_date >= data.bill_date, {
    message: 'Due date must be on or after bill date',
    path: ['due_date'],
  });

export type BillInput = z.infer<typeof BillInputSchema>;
export type BillLineInput = z.infer<typeof BillLineSchema>;
