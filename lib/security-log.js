import { reportServerError } from "./monitoring.js";

function safeCode(error) {
  const value = error?.code;
  return typeof value === "string" && /^[A-Z0-9_-]{1,64}$/i.test(value)
    ? value
    : undefined;
}

// Fixed classification of Prisma interactive-transaction errors (P2028). Only this
// enum is logged; the Prisma message itself is never emitted.
export function prismaTransactionErrorKind(error) {
  if (safeCode(error) !== "P2028") return undefined;
  const message = typeof error?.message === "string" ? error.message : "";
  if (message.includes("Unable to start a transaction in the given time")) return "POOL_WAIT";
  if (message.includes("expired transaction")) return "TRANSACTION_TIMEOUT";
  if (message.includes("Transaction already closed") || message.includes("Transaction not found")) return "TRANSACTION_CLOSED";
  return "OTHER";
}

export function logServerError(context, error, metadata = {}) {
  const safeMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) =>
      typeof value === "number" || typeof value === "boolean"
    )
  );
  const transactionError = prismaTransactionErrorKind(error);
  console.error(context, {
    errorType: error?.name || "Error",
    ...(safeCode(error) ? { code: safeCode(error) } : {}),
    ...(transactionError ? { transactionError } : {}),
    ...safeMetadata
  });
  reportServerError(context, error, {
    ...(safeCode(error) ? { code: safeCode(error) } : {}),
    ...(transactionError ? { transactionError } : {})
  });
}
