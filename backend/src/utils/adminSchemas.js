const { z } = require('zod');


/*
|--------------------------------------------------------------------------
| Professional ID
|--------------------------------------------------------------------------
*/

const professionalIdSchema = z.object({
  body: z.object({}).strict(),

  params: z.object({
    professionalId: z
      .string()
      .uuid('Invalid professional ID.'),
  }),

  query: z.object({}).strict(),
});


/*
|--------------------------------------------------------------------------
| User ID
|--------------------------------------------------------------------------
*/

const userIdSchema = z.object({
  body: z.object({}).strict(),

  params: z.object({
    userId: z
      .string()
      .uuid('Invalid user ID.'),
  }),

  query: z.object({}).strict(),
});


/*
|--------------------------------------------------------------------------
| List Users
|--------------------------------------------------------------------------
*/

const adminUsersSchema = z.object({
  body: z.object({}).strict(),

  params: z.object({}).strict(),

  query: z
    .object({
      limit: z
        .coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20),

      offset: z
        .coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(0),

      status: z
        .enum([
          'ACTIVE',
          'SUSPENDED',
          'DEACTIVATED',
          'PENDING_DELETION',
        ])
        .optional(),
    })
    .strict(),
});


module.exports = {
  professionalIdSchema,
  userIdSchema,
  adminUsersSchema,
};