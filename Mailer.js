import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

class Mailer {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.messagingEmailId,
        pass: process.env.messagingEmailPassword,
      }
    });
  }
  async sendWelcomeMessageWithPresetPassword(receiverEmailId, presetPassword, userName) {
    const prepareHtmlMsg = () => {
      return `
        <p>Hello ${userName},</p>
        <p>An account has been created for you in the TIMSCDR Placement Manager webapp. Your email adddress is <span style="font-weight: bold;">${receiverEmailId}</span> and your login password is <span style="font-weight: bold;">${presetPassword}<span/>.</p>
        <p><em>We strongly recommend that you change the default password as soon as possible.<em/></p>
        <p>Thank you</p>
      `;
    };
    const opts = {
      from: process.env.messagingEmailId,
      to: receiverEmailId,
      subject: "Welcome to Placement Manager",
      html: prepareHtmlMsg(),
    };

    try {
      const info = await this.transporter.sendMail(opts); 
      console.log(`Welcome email sent to ${receiverEmailId}`);
      console.log(info.response)
    } catch (error) {
      console.error(`failed to Welcome email (with password) to ${receiverEmailId}`);
      console.error(error);
      // todo: if the error is due to providing wrong email then inform that back to the user and revert changes in the db
    }
  }
}

const mailer = new Mailer();
export default mailer;
