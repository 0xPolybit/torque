export type UpdateErrorCategory =
  | "network"
  | "github"
  | "manifest"
  | "version"
  | "signature"
  | "disk-space"
  | "permission"
  | "download"
  | "install"
  | "restart"
  | "other";

export type UpdateOperation = "check" | "download" | "install" | "restart";

export function classifyUpdateError(
  error: unknown,
  operation: UpdateOperation,
): { category: UpdateErrorCategory; message: string };
export function safeUpdateFailureDetail(error: unknown): string | null;
