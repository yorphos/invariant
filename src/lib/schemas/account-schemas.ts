import { z } from 'zod';

import {
  IdSchema,
  NonEmptyStringSchema,
  OptionalNullableIdSchema,
} from './common';

export const AccountTypeSchema = z.enum([
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
]);

export const AccountSchema = z
  .object({
    code: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    type: AccountTypeSchema,
    parent_id: OptionalNullableIdSchema,
    is_active: z.boolean(),
  })
  .strict();

export const AccountUpdateSchema = z
  .object({
    code: NonEmptyStringSchema.optional(),
    name: NonEmptyStringSchema.optional(),
    type: AccountTypeSchema.optional(),
    parent_id: IdSchema.nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export type AccountInput = z.infer<typeof AccountSchema>;
export type AccountUpdateInput = z.infer<typeof AccountUpdateSchema>;
