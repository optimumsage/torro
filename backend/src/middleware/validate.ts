import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

type Schemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

// Validate request parts against zod schemas; parsed/coerced values are attached to `req.valid`.
// (Express 5 makes req.query a getter, so we don't mutate it in place.)
// A ZodError thrown here is mapped to a generic 400 by the central error handler.
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const valid: { body?: unknown; query?: unknown; params?: unknown } = {};
      if (schemas.params) valid.params = schemas.params.parse(req.params);
      if (schemas.query) valid.query = schemas.query.parse(req.query);
      if (schemas.body) valid.body = schemas.body.parse(req.body);
      req.valid = valid;
      next();
    } catch (err) {
      next(err);
    }
  };
}
