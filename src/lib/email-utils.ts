/**
 * Clean incoming email HTML — strip quoted replies, Gmail date headers, direction markers.
 * Used by communications page and correspondence tab.
 */
export function cleanIncomingContent(html: string): string {
  let cleaned = html;

  // Remove Unicode direction markers, zero-width chars, RTL/LTR marks
  cleaned = cleaned.replace(/[\u200F\u200E\u202B\u202C\u202A\u202D\u202E\u200D\u200C\u200B\u2069\u2068\u2067\u2066\uFEFF]/g, "");

  // Remove gmail_quote divs and everything inside them
  cleaned = cleaned.replace(/<div\s+class=["']gmail_quote["'][\s\S]*$/gi, "");

  // Remove blockquote elements (quoted replies)
  cleaned = cleaned.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "");
  cleaned = cleaned.replace(/<blockquote[\s\S]*$/gi, "");

  // Remove Hebrew "בתאריך ... כתב/ה:" quoting header and everything after
  cleaned = cleaned.replace(/\s*בתאריך\s+[^<]{10,}כתב.*:[\s\S]*$/gi, "");
  cleaned = cleaned.replace(/\s*בתאריך\s+\d{1,2}[\s\S]{0,80}כתב[\s\S]*$/gi, "");

  // Remove English "On ... wrote:" header and everything after
  cleaned = cleaned.replace(/\s*On\s+\w{3,},?\s+\w[\s\S]*?wrote:\s*[\s\S]*$/gi, "");

  // Remove "---------- Forwarded/Original message" blocks
  cleaned = cleaned.replace(/\s*-{3,}\s*(Forwarded|Original|הודעה)[\s\S]*/gi, "");

  // Remove trailing <br>, empty divs, whitespace
  cleaned = cleaned.replace(/(<br\s*\/?>|<div>\s*<\/div>|\s)*$/gi, "").trim();

  // If nothing meaningful left, return original content
  const textOnly = cleaned.replace(/<[^>]*>/g, "").trim();
  if (!textOnly || textOnly.length === 0) {
    return html;
  }

  return cleaned;
}

/**
 * Map internal payment method names to billing provider format.
 */
export function mapPaymentMethod(method: string): 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other' {
  const mapping: Record<string, 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other'> = {
    CASH: 'cash',
    CHECK: 'check',
    BANK_TRANSFER: 'bank_transfer',
    CREDIT_CARD: 'credit_card',
    CREDIT: 'other',
    OTHER: 'other',
  };
  return mapping[method] || 'other';
}
