const { z } = require('zod');


const createConversationSchema = z.object({
  body: z
    .object({
      topic: z
        .string()
        .trim()
        .min(1)
        .max(150),

      message: z
        .string()
        .trim()
        .min(1)
        .max(5000),
    })
    .strict(),

  params: z.object({}),

  query: z.object({}),
});


const sendMessageSchema = z.object({
  body: z
    .object({
      message: z
        .string()
        .trim()
        .min(1)
        .max(5000),
    })
    .strict(),

  params: z.object({
    conversationId: z
      .string()
      .uuid('Invalid conversation ID.'),
  }),

  query: z.object({}),
});


const conversationIdSchema = z.object({
  body: z.object({}),

  params: z.object({
    conversationId: z
      .string()
      .uuid('Invalid conversation ID.'),
  }),

  query: z.object({}),
});


module.exports = {
  createConversationSchema,
  sendMessageSchema,
  conversationIdSchema,
};