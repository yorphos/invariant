import { z } from 'zod';

export const MoneySchema = z
  .number()
  .positive('Amount must be greater than 0')
  .refine((value) => Math.round(value * 100) === value * 100, {
    message: 'Amount must be in cents (2 decimal places)',
  });

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const IdSchema = z.number().int().positive('ID must be a positive integer');

export const NonEmptyStringSchema = z.string().trim().min(1, 'Required');

export const PhoneSchema = z
  .string()
  .regex(/^[\d\s\-()+.]{7,20}$/, 'Invalid phone number')
  .optional();

export const OptionalStringSchema = z.string().trim().optional();

export const OptionalNullableIdSchema = IdSchema.nullable().optional();
