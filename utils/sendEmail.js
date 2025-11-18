const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // 1) Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT, // 587 for TLS
    secure: false, // false for TLS
    auth: {
      user: process.env.EMAIL_USERNAME, // متوافق مع .env
      pass: process.env.EMAIL_PASSWORD, // استخدم App Password
    },
  });

  // 2) Define email options
  const mailOpts = {
    from: `Filevo App <${process.env.EMAIL_FROM}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  // 3) Send email
  await transporter.sendMail(mailOpts);
};

module.exports = sendEmail;
