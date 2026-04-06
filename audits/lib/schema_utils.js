// audits/lib/schema_utils.js
// JSON schema validation utilities for audit checks.

export function validateSchema(obj, schema) {
  const errors = [];

  if (!obj || typeof obj !== "object") {
    errors.push({ path: "$", message: "Expected object, got " + typeof obj });
    return { valid: false, errors };
  }

  if (schema.type === "object" && schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const value = obj[key];
      const path = `$.${key}`;

      if (propSchema.required && (value === undefined || value === null)) {
        errors.push({ path, message: `Required field '${key}' is missing` });
        continue;
      }

      if (value !== undefined && value !== null) {
        if (propSchema.type && typeof value !== propSchema.type) {
          errors.push({ path, message: `Expected ${propSchema.type} for '${key}', got ${typeof value}` });
        }
        if (propSchema.enum && !propSchema.enum.includes(value)) {
          errors.push({ path, message: `Value '${value}' not in allowed values: ${propSchema.enum.join(", ")}` });
        }
        if (propSchema.min !== undefined && typeof value === "number" && value < propSchema.min) {
          errors.push({ path, message: `Value ${value} is below minimum ${propSchema.min}` });
        }
        if (propSchema.pattern && typeof value === "string" && !new RegExp(propSchema.pattern).test(value)) {
          errors.push({ path, message: `Value '${value}' does not match pattern ${propSchema.pattern}` });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export const AUDIT_REPORT_SCHEMA = {
  type: "object",
  properties: {
    auditType: { type: "string", required: true },
    status: { type: "string", required: true, enum: ["pass", "warn", "fail", "critical"] },
    startedAt: { type: "string", required: true },
    completedAt: { type: "string", required: true },
    summary: {
      type: "object",
      properties: {
        pass: { type: "number" },
        warn: { type: "number" },
        fail: { type: "number" },
        critical: { type: "number" },
      },
    },
    checks: { type: "array" },
  },
};

export function validateAuditReport(report) {
  return validateSchema(report, AUDIT_REPORT_SCHEMA);
}
