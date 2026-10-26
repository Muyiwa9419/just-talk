const { z } = require('zod');

/*
|--------------------------------------------------------------------------
| Create Professional Profile
|--------------------------------------------------------------------------
*/

const createProfessionalProfileSchema = z.object({
  body: z
    .object({
      displayName: z
        .string()
        .trim()
        .min(2, 'Display name must be at least 2 characters.')
        .max(100, 'Display name is too long.'),

      bio: z
        .string()
        .trim()
        .max(1000, 'Bio is too long.')
        .optional()
        .default(''),

      categories: z
        .array(
          z
            .string()
            .trim()
            .min(2, 'Category is too short.')
            .max(100, 'Category is too long.')
        )
        .max(
          20,
          'You can select a maximum of 20 categories.'
        )
        .default([]),
    })
    .strict(),

  params: z.object({}),
  query: z.object({}),
});


/*
|--------------------------------------------------------------------------
| Update Professional Profile
|--------------------------------------------------------------------------
*/

const updateProfessionalProfileSchema = z.object({
  body: z
    .object({
      displayName: z
        .string()
        .trim()
        .min(2, 'Display name must be at least 2 characters.')
        .max(100, 'Display name is too long.')
        .optional(),

      bio: z
        .string()
        .trim()
        .max(1000, 'Bio is too long.')
        .optional(),

      categories: z
        .array(
          z
            .string()
            .trim()
            .min(2, 'Category is too short.')
            .max(100, 'Category is too long.')
        )
        .max(
          20,
          'You can select a maximum of 20 categories.'
        )
        .optional(),
    })
    .strict(),

  params: z.object({}),
  query: z.object({}),
});


module.exports = {
  createProfessionalProfileSchema,
  updateProfessionalProfileSchema,
};