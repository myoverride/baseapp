export type ErrorType = "MISSING_REQUIRED" | "TYPE_MISMATCH" | "OUT_OF_BOUNDS" | "EXPIRED_TIMESTAMP";

export interface ValidationError {
  field: string;
  errorType: ErrorType;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  action: "SAVE" | "REJECT";
  errors: ValidationError[];
  processedPayload: Record<string, any>;
}

function toObjectPayload(payload: any): Record<string, any> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload;
  }

  // LWT/offline gibi düz metin veya farklı formatları kaybetmemek için
  // güvenli bir obje formuna sarıp pass ediyoruz.
  return {
    _raw: payload,
    _non_object_payload: true
  };
}

function isTypeMatch(value: any, expectedType: string): boolean {
  if (value === null || value === undefined) return true;

  switch (expectedType) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
    case 'date':
    case 'time':
    case 'relation':
      return typeof value === 'string' || typeof value === 'number';
    case 'json':
      return typeof value === 'object' || typeof value === 'string';
    default:
      return true;
  }
}

function normalizeSchema(schema: any): Record<string, any> {
  if (!schema) return {};
  if (typeof schema === 'string') {
    try {
      const parsed = JSON.parse(schema);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof schema === 'object' ? schema : {};
}

export async function validateTelemetry(tenantSlug: string, payload: any, schema: any, _timestamp: number, _ignoreTimestampValidation: boolean = false): Promise<ValidationResult> {
  const {} = await import('./globalsManager');
  const sysMode = await globals.get(tenantSlug, 'TELEMETRY_VALIDATION_MODE', false, 'relaxed');
  const mode = String(sysMode).toLowerCase();

  // relaxed veya tanımsız mod: hiçbir tarih/timestamp reddi olmadan esnek kabul
  if (mode !== 'strict') {
    return {
      isValid: true,
      action: 'SAVE',
      errors: [],
      processedPayload: toObjectPayload(payload)
    };
  }

  const objectPayload = toObjectPayload(payload);

  // Strict modda bile LWT/offline/şema dışı payloadları kaybetmemek için
  // _non_object_payload bayrağı varsa pass-through yapıyoruz.
  if ((objectPayload as any)._non_object_payload) {
    return {
      isValid: true,
      action: 'SAVE',
      errors: [],
      processedPayload: objectPayload
    };
  }

  const normalizedSchema = normalizeSchema(schema);
  const errors: ValidationError[] = [];

  for (const [fieldName, value] of Object.entries(objectPayload)) {
    const fieldConfig = normalizedSchema[fieldName];

    // Şemada tanımı olmayan alanlar LWT/offline senaryolarında kaybolmasın diye reddedilmiyor.
    if (!fieldConfig) continue;

    const expectedType = String(fieldConfig.type || '').toLowerCase();
    if (!isTypeMatch(value, expectedType)) {
      errors.push({
        field: fieldName,
        errorType: 'TYPE_MISMATCH',
        message: 'error.fieldTypeMismatch'
      });
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      action: 'REJECT',
      errors,
      processedPayload: {}
    };
  }

  // KRITIK: timestamp age/expiration kontrolü bilinçli olarak YOK.
  return {
    isValid: true,
    action: 'SAVE',
    errors: [],
    processedPayload: objectPayload
  };
}

export const RESERVED_SLUGS = [
  'api', 'admin', 'auth', 'users', 'tenant', 'system', 'webhook', 'records', 'login', 'logout', 'dashboard'
];

export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') return false;
  // Sadece küçük harf, rakam ve alt çizgi
  if (!/^[a-z0-9_]+$/.test(slug)) return false;
  
  if (RESERVED_SLUGS.includes(slug)) return false;
  
  return true;
}
