const { z } = require('zod');


/*
|--------------------------------------------------------------------------
| Get My Conversations
|--------------------------------------------------------------------------
*/

const getMyConversationsSchema = z.object({
  body: z.object({}).strict(),

  params: z.object({}).strict(),

  query: z
    .object({
      limit: z
        .coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20),

      offset: z
        .coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(0),
    })
    .strict(),
});


module.exports = {
  getMyConversationsSchema,
};