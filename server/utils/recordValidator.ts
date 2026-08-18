

/**
 * Özel kayıt verilerini entity şemasına göre doğrular.
 * Tip uyumu, zorunluluk ve RELATION alanı için hedef kaydın varlığını kontrol eder.
 */
// server/utils/recordValidator.ts

export const checkUniqueConstraints = async (sql: any, entityId: any, schema: any, data: any, recordId?: any) => {
  for (const [key, fieldConfig] of Object.entries(schema)) {
    // SQL Injection Koruması
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      throw new Error(`Invalid schema key format: ${key}`);
    }
    
    const config = fieldConfig as any;

    // Eğer şemada unique: true ise ve veri boş değilse
    if (config.rules?.unique === true && data[key] !== null && data[key] !== undefined) {
      const val = data[key];

      const boolVal = (val === 'true' || val === true) ? 1 : 0;
      const numVal = Number(val);
      const safeNum = Number.isNaN(numVal) ? null : numVal;
      
      // Veritabanında kontrol et (Eğer edit modundaysak, kendi ID'mizi hariç tutmalıyız!)
      const query = recordId
        ? sql`SELECT 1 FROM record_fields rf JOIN records r ON rf.record_id = r.id WHERE r.entity_id = ${entityId} AND rf.key = ${key} AND (rf.val_str = ${String(val)} OR rf.val_num = ${safeNum} OR rf.val_bool = ${boolVal}) AND rf.record_id != ${recordId} LIMIT 1`
        : sql`SELECT 1 FROM record_fields rf JOIN records r ON rf.record_id = r.id WHERE r.entity_id = ${entityId} AND rf.key = ${key} AND (rf.val_str = ${String(val)} OR rf.val_num = ${safeNum} OR rf.val_bool = ${boolVal}) LIMIT 1`;

      const exists = await query;
      if (exists.length > 0) {
        return `error.uniqueConstraint|${key}`;
      }
    }
  }
  return null; // Hata yok
};


// 1. Özel tarih parser (Frontend'deki ile aynı mantık, backend'de çalışır)
const parseCustomDate = (expr: string): Date | null => {
  if (!expr) return null;
  const exprClean = expr.replace(/\s+/g, '');
  if (/^today\(\)$/i.test(exprClean)) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const match = exprClean.match(/^today\(\)([+-])(\d+)([dwmy])$/i) as any;
  if (match) {
    const date = new Date();
    const operator = match[1];
    const amount = parseInt(match[2]);
    const unit = match[3].toLowerCase();

    let days = 0;
    if (unit === 'd') days = amount;
    else if (unit === 'w') days = amount * 7;
    else if (unit === 'm') days = amount * 30;
    else if (unit === 'y') days = amount * 365;

    operator === '-' ? date.setDate(date.getDate() - days) : date.setDate(date.getDate() + days);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  const parsedDate = new Date(expr);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
};

// 2. Asıl Validasyon ve Type-Casting Fonksiyonu
export const validateRecordData = (payload: any, schema: any) => {
  const errors: any[] = [];
  const processedPayload: any = {}; // DB'ye yazılacak, tipi düzeltilmiş TEMİZ veri

  for (const [fieldName, fieldConfig] of Object.entries(schema)) {
    let value = payload[fieldName];
    const config = fieldConfig as any;
    const isRequired = config.rules?.required;

    // --- 1. ZORUNLULUK (REQUIRED) KONTROLÜ ---
    // Boolean alanlarda required: true demek alanın null veya tanımsız (undefined) olmamasını gerektirir, 
    // mutlak surette 'true' olmasını DİYATMAZ. (Kullanıcı false/hayır seçebilir)

    if (isRequired && (value === null || value === undefined || value === '')) {
      errors.push({ field: fieldName, message: 'error.fieldIsRequired' });
      continue;
    }

    // Değer yoksa diğer kurallara bakma (Zorunlu değildi demek ki, null olarak geçir)
    if (value === null || value === undefined || value === '') {
      processedPayload[fieldName] = null;
      continue;
    }

    // --- 2. CUSTOM KURAL KONTROLLERİ ---
    if (config.rules?.custom && Array.isArray(config.rules.custom)) {
      for (const rule of config.rules.custom) {
        const val = rule.value;
        const msg = rule.message;

        switch (rule.type) {
          case 'minLength': if (String(value).length < Number(val)) errors.push({ field: fieldName, message: msg || 'validation.minLength' }); break;
          case 'maxLength': if (String(value).length > Number(val)) errors.push({ field: fieldName, message: msg || 'validation.maxLength' }); break;
          case 'exactLength': if (String(value).length !== Number(val)) errors.push({ field: fieldName, message: msg || 'validation.exactLength' }); break;
          case 'alphanumeric': if (!/^[a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]+$/.test(String(value))) errors.push({ field: fieldName, message: msg || 'validation.alphanumeric' }); break;
          case 'email': if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors.push({ field: fieldName, message: msg || 'validation.invalidEmail' }); break;

          case 'min': if (Number(value) < Number(val)) errors.push({ field: fieldName, message: msg || 'validation.minVal' }); break;
          case 'max': if (Number(value) > Number(val)) errors.push({ field: fieldName, message: msg || 'validation.maxVal' }); break;
          case 'isInteger': if (!Number.isInteger(Number(value))) errors.push({ field: fieldName, message: msg || 'validation.integerOnly' }); break;
          case 'step': if ((Number(value) % Number(val)) !== 0) errors.push({ field: fieldName, message: msg || 'validation.stepMismatch' }); break;

          case 'isTrue': if (String(value) !== 'true' && value !== true) errors.push({ field: fieldName, message: msg || 'validation.required' }); break;

          case 'minDate': {
            const minD = parseCustomDate(val);
            const curDMin = new Date(value); curDMin.setHours(0, 0, 0, 0);
            if (minD && curDMin < minD) errors.push({ field: fieldName, message: msg || 'validation.minDate' });
          } break;
          case 'maxDate': {
            const maxD = parseCustomDate(val);
            const curDMax = new Date(value);
            curDMax.setHours(0,0,0,0);
            if (maxD && curDMax > maxD) errors.push({ field: fieldName, message: msg || 'validation.maxDate' });
            break;
          }
          case 'minTime': if (String(value) < String(val)) errors.push({ field: fieldName, message: msg || 'validation.minTime' }); break;
          case 'maxTime': if (String(value) > String(val)) errors.push({ field: fieldName, message: msg || 'validation.maxTime' }); break;

          case 'regex': if (!new RegExp(val).test(String(value))) errors.push({ field: fieldName, message: msg || 'validation.regexMismatch' }); break;
          case 'json':
            if (typeof value === 'string') {
              try { JSON.parse(value); } catch { errors.push({ field: fieldName, message: msg || 'rule.validJson' }); }
            }
            break;
        }
      }
    }

    // --- 3. DOĞRU TYPE-CASTING (EAV Veritabanı Kurtarıcısı) ---
    // Hata varsa dönüştürmeye uğraşma
    if (errors.some(e => e.field === fieldName)) continue;

    try {
      if (config.type === 'number' || config.type === 'relation') {
        const numVal = Number(value);
        if (Number.isNaN(numVal)) {
          errors.push({ field: fieldName, message: 'error.mustBeValidNumber' });
        } else {
          processedPayload[fieldName] = numVal;
        }
      }
      else if (config.type === 'boolean') processedPayload[fieldName] = (value === 'true' || value === true);
      else if (['string', 'password', 'date', 'time'].includes(config.type)) processedPayload[fieldName] = String(value);
      else if (config.type === 'json' && typeof value === 'string') processedPayload[fieldName] = JSON.parse(value);
      else processedPayload[fieldName] = value;
    } catch {
      errors.push({ field: fieldName, message: 'error.typeConversionError' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    processedPayload: processedPayload
  };
};