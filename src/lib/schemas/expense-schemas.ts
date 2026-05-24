import { z } from 'zod';

import {
  DateStringSchema,
  IdSchema,
  MoneySchema,
  NonEmptyStringSchema,
  OptionalStringSchema,
} from './common';

export const ExpenseInputSchema = z
  .object({
    description: NonEmptyStringSchema,
    amount: MoneySchema,
    expense_date: DateStringSchema,
    vendor_id: IdSchema.optional(),
    expense_account_id: IdSchema,
    payment_account_id: IdSchema,
    reference: OptionalStringSchema,
    notes: OptionalStringSchema,
  })
  .strict();

export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;
