import nodemailer, { Transporter } from 'nodemailer';

export class MailerService {
  private static transporter: Transporter | null = null;

  private static getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }

    return this.transporter;
  }

  /**
   * Dispatch branded HTML verification email with 6-digit OTP code
   */
  static async sendVerificationCode(email: string, username: string, code: string): Promise<boolean> {
    const fromAddress = process.env.EMAIL_FROM || '"WafaTalk Sécurité" <no-reply@wafatalk.com>';
    const subject = `🔐 Votre code de vérification WafaTalk : ${code}`;

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8f6f1; margin: 0; padding: 24px 12px; color: #0f1d1c; }
        .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 8px 30px rgba(13, 80, 76, 0.08); border: 1px solid rgba(13, 131, 125, 0.12); }
        .header { background: linear-gradient(135deg, #0d837d 0%, #16a39b 100%); padding: 36px 24px; text-align: center; }
        .header-title { font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; margin: 0; }
        .badge { display: inline-block; background: rgba(255, 255, 255, 0.22); color: #ffffff; padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-top: 10px; }
        .body { padding: 32px 28px; }
        .title { font-size: 20px; font-weight: 800; color: #0f1d1c; margin-bottom: 12px; text-align: center; }
        .text { font-size: 15px; line-height: 1.6; color: #48605e; margin-bottom: 20px; text-align: center; }
        .code-box { background: #f0ece4; border: 2px dashed #0d837d; border-radius: 14px; padding: 22px 16px; text-align: center; margin: 24px 0; }
        .code-number { font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #0d837d; font-family: 'Courier New', monospace; margin-left: 10px; }
        .expiry { font-size: 13px; color: #f25b3e; font-weight: 700; margin-top: 10px; }
        .notice { font-size: 12px; line-height: 1.5; color: #7c9492; background: #fdfcfa; padding: 14px 18px; border-radius: 10px; border-left: 3.5px solid #f8b84e; margin-top: 24px; }
        .footer { padding: 22px 24px; text-align: center; font-size: 12px; color: #7c9492; border-top: 1px solid #f0ece4; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="header-title">WafaTalk 🎈</h1>
          <div class="badge">🛡️ Sécurité & Vérification Anti-Bot</div>
        </div>
        <div class="body">
          <div class="title">Bienvenue, ${username} !</div>
          <div class="text">
            Pour valider votre inscription et protéger notre communauté des robots, voici votre code de vérification à 6 chiffres :
          </div>
          <div class="code-box">
            <div class="code-number">${code}</div>
            <div class="expiry">⏱️ Ce code expire dans 10 minutes</div>
          </div>
          <div class="notice">
            <strong>Conseil de sécurité :</strong> Ne partagez jamais ce code. Si vous n'avez pas demandé à rejoindre WafaTalk, vous pouvez ignorer cet e-mail en toute sécurité.
          </div>
        </div>
        <div class="footer">
          &copy; 2026 WafaTalk — Plateforme de Salons Nouvelle Génération.<br>
          Données protégées conformément au RGPD & hébergées en Union Européenne.
        </div>
      </div>
    </body>
    </html>
    `;

    console.log(`\n======================================================`);
    console.log(`📧 [EMAIL VERIFICATION DISPATCH]`);
    console.log(`Destinataire : ${email} (${username})`);
    console.log(`Code OTP     : ${code}`);
    console.log(`Expiration   : 10 minutes`);
    console.log(`======================================================\n`);

    const transporter = this.getTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: fromAddress,
          to: email,
          subject,
          html: htmlContent,
        });
        console.log(`✅ Email de vérification délivré avec succès à ${email}`);
        return true;
      } catch (err: any) {
        console.warn(`⚠️ Échec d'envoi SMTP (${err.message}). Code OTP disponible en console de dev.`);
        return true;
      }
    } else {
      console.log(`ℹ️ Mode Développement / Local : SMTP non configuré, code disponible en console ci-dessus.`);
      return true;
    }
  }
}
