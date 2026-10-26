const { z } = require('zod');

const createMatchingRequestSchema = z.object({
  body: z.object({
    category: z
      .string()
      .trim()
      .min(2, 'Category is required.')
      .max(100, 'Category is too long.'),

    conversationId: z
      .string()
      .uuid('Invalid conversation ID.'),
  }),

  params: z.object({}),

  query: z.object({}),
});


const matchingRequestIdSchema = z.object({
  body: z.object({}),

  params: z.object({
    requestId: z
      .string()
      .uuid('Invalid matching request ID.'),
  }),

  query: z.object({}),
});


const availabilitySchema = z.object({
  body: z.object({
    availability: z.enum(
      ['AVAILABLE', 'OFFLINE'],
      {
        message:
          'Availability must be AVAILABLE or OFFLINE.',
      }
    ),
  }),

  params: z.object({}),

  query: z.object({}),
});


module.exports = {
  createMatchingRequestSchema,
  matchingRequestIdSchema,
  availabilitySchema,
};