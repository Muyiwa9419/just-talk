const { z } = require('zod');

const registerSchema = z.object({
  body: z
    .object({
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email('Please provide a valid email address.')
        .max(255),

      password: z
        .string()
        .min(
          8,
          'Password must contain at least 8 characters.'
        )
        .max(128, 'Password is too long.'),
    })
    .strict(),

  params: z.object({}),
  query: z.object({}),
});

const loginSchema = z.object({
  body: z
    .object({
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email('Please provide a valid email address.')
        .max(255),

      password: z
        .string()
        .min(1, 'Password is required.')
        .max(128),
    })
    .strict(),

  params: z.object({}),
  query: z.object({}),
});

module.exports = {
  registerSchema,
  loginSchema,
};