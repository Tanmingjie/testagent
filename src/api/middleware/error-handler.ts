import type { ErrorHandler } from "hono";

export const errorHandler: ErrorHandler = (err, c) => {
  console.error("API Error:", err);

  const status =
    "status" in err && typeof (err as any).status === "number"
      ? (err as any).status
      : 500;

  return c.json(
    {
      error: err.message || "Internal Server Error",
      status,
    },
    status,
  );
};
