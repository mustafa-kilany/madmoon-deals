// Sending emails. For now codes are printed in the server's terminal; before
// launch, plug in an email service here (e.g. Amazon SES, Resend, Postmark):
// one send() function, nothing else changes.

export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    console.log(`\n✉  To: ${to}\n   Subject: ${subject}\n   ${text.replace(/\n/g, '\n   ')}\n`);
  },
};

export const mailer: Mailer = consoleMailer;

export const codeEmail = (purpose: 'signup' | 'reset', code: string) =>
  purpose === 'signup'
    ? {
        subject: `رمز التحقق من سهلة: ${code} | Your Sahla code`,
        text: `رمز التحقق: ${code}\nYour verification code: ${code}\n\nValid for 10 minutes. If you didn't ask for it, ignore this email.`,
      }
    : {
        subject: `إعادة تعيين كلمة المرور: ${code} | Reset your Sahla password`,
        text: `رمز إعادة التعيين: ${code}\nYour reset code: ${code}\n\nValid for 10 minutes. If you didn't ask for it, ignore this email; your password stays the same.`,
      };
