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
    const opts = {
      from: process.env.messagingEmailId,
      to: receiverEmailId,
      subject: "Welcome to Placement Manager",
      text: `Hello ${userName}, an account has been created for you in the TSCS palcement manager web app. Your email id is ${receiverEmailId} and your login password id ${presetPassword}. We strongly recommend that you change the default password as soon as possible. Thank you.`,
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
