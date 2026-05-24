import { z } from 'zod';

import {
  NonEmptyStringSchema,
  OptionalStringSchema,
  PhoneSchema,
} from './common';

export const ContactTypeSchema = z.enum(['customer', 'vendor', 'both']);

export const ContactSchema = z
  .object({
    type: ContactTypeSchema,
    name: NonEmptyStringSchema,
    email: z.email('Invalid email address').optional(),
    phone: PhoneSchema,
    address: OptionalStringSchema,
    tax_id: OptionalStringSchema,
    is_active: z.boolean(),
  })
  .strict();

export const ContactUpdateSchema = z
  .object({
    type: ContactTypeSchema.optional(),
    name: NonEmptyStringSchema.optional(),
    email: z.email('Invalid email address').optional(),
    phone: PhoneSchema,
    address: OptionalStringSchema,
    tax_id: OptionalStringSchema,
    is_active: z.boolean().optional(),
  })
  .strict();

export type ContactInput = z.infer<typeof ContactSchema>;
export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>;
