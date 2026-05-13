import { z } from "zod";

const LATIN_RE = /^[\x21-\x7E]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const authCredentialsSchema = z.object({
  email: z
    .string()
    .email("invalid email")
    .max(50, "email is too long")
    .regex(LATIN_RE, "email must contain only latin characters")
    .transform((s) => s.toLowerCase()),
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .max(50, "password is too long")
    .regex(LATIN_RE, "password must contain only latin characters"),
});

const trimOrNull = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const t = v.trim();
      return t.length === 0 ? null : t;
    });

const requiredTrimmed = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .transform((v) => v.trim())
    .refine((v) => v.length >= min, { message: "must not be blank" });

const isoDate = z.string().regex(ISO_DATE_RE, "expected YYYY-MM-DD");

export const taskCreateSchema = z.object({
  title: requiredTrimmed(1, 500),
  description: trimOrNull(500),
  due_date: isoDate,
});

export const taskUpdateSchema = z.object({
  title: requiredTrimmed(1, 500).optional(),
  description: trimOrNull(500),
  due_date: isoDate.optional(),
  is_done: z.boolean().optional(),
});

export const listQuerySchema = z.object({
  filter: z.enum(["all", "active", "done", "overdue"]).default("all"),
  sort_by: z.enum(["due_date", "created_at", "title"]).default("due_date"),
  desc: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((s) => s === "true"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
