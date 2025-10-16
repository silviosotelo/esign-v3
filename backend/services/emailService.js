const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Outlook365',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

exports.sendPasswordResetEmail = async (to, link) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Restablecimiento de Contraseña',
    html: `<p>Haz clic <a href="${link}">aquí</a> para restablecer tu contraseña.</p>`
  };

  await transporter.sendMail(mailOptions);
};