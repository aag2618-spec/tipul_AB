import { z } from "zod";
import {
  zEmail,
  zPassword,
  zPhoneOptional,
  zSecretToken,
  zTwoFactorCode,
} from "./shared";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "שם הוא שדה חובה").max(80, "שם ארוך מדי"),
  email: zEmail,
  password: zPassword,
  phone: zPhoneOptional,
  license: z.string().trim().max(100, "מספר רישיון ארוך מדי").optional().or(z.literal("")),
  couponCode: z.string().trim().max(64, "קוד קופון לא תקין").optional().or(z.literal("")),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// H12: forgot-password — רק email. cap על אורך מונע DoS.
export const forgotPasswordSchema = z.object({
  email: zEmail,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// H12: reset-password — token + סיסמה חדשה.
// token: 64 hex chars (randomBytes(32).toString("hex")).
export const resetPasswordSchema = z.object({
  token: zSecretToken,
  password: zPassword,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// H12: resend-verification — רק email.
export const resendVerificationSchema = z.object({
  email: zEmail,
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

// H12: 2FA send — רק email. אותו schema כמו check-required.
export const twoFactorSendSchema = z.object({
  email: zEmail,
});
export type TwoFactorSendInput = z.infer<typeof twoFactorSendSchema>;

// H12: 2FA check-required — email לבדיקה אם נדרש 2FA.
export const twoFactorCheckRequiredSchema = z.object({
  email: zEmail,
});
export type TwoFactorCheckRequiredInput = z.infer<typeof twoFactorCheckRequiredSchema>;

// H12: 2FA verify — email + code (TOTP/SMS/recovery).
// code חייב להישאר string trimmed; הנרמול עצמו ב-two-factor lib.
export const twoFactorVerifySchema = z.object({
  email: zEmail,
  code: zTwoFactorCode,
});
export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;
