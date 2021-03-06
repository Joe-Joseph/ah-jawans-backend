/* eslint-disable require-jsdoc */
import dotenv from 'dotenv';
import SendGrid from '@sendgrid/mail';
import models from '../models';
import tokenGen from '../helpers/tokenGenerator';
import bcrypt from '../helpers/hash';
import MailSender from '../helpers/mail';
import { findUserData } from './helpers/findUser';

const { User, Blacklist } = models;
const { generateToken, decodeToken } = tokenGen;

dotenv.config();

const { SENDGRID_API_KEY } = process.env;
export default class UserController {
  static async createUser(req, res) {
    SendGrid.setApiKey(SENDGRID_API_KEY);
    const verified = false;
    try {
      const { username, email, password } = req.body;
      const hashedPasword = await bcrypt.hashPasword(password);
      const foundUser = await User.findOne({ where: { email: String(email) } });
      const findByUsername = await User.findOne({ where: { username: String(username) } });

      if (foundUser || findByUsername) {
        return (foundUser && res.status(409).json({ error: 'email has been taken by user' })) || (findByUsername && res.status(409).json({ error:
            'username has been taken by another user' }));
      }
      const user = await User.create({ username,
        email,
        password: hashedPasword,
        verified,
        roles: ['normalUser'] });

      const payload = { username: user.username,
        id: user.id,
        email: user.email,
        verified: user.verified,
        roles: user.roles };

      const token = await generateToken(payload);
      const mailSend = await MailSender.sendMail(user.email, user.username, token);

      if (mailSend[0].statusCode === 202) {
        return res.status(201).json({ message: 'Your account has been created. You can check your email for comfirmation.',
          token,
          username: user.username,
          email: user.email });
      }
    } catch (error) {
      return res.status(500)
        .json({ Error: error.message });
    }
  }

  static async passwordReset(req, res) {
    try {
      const user = await User.findOne({ where: { email: req.body.email }, });
      if (!user) {
        return res.status(404).json({ error: 'No user found with this email address.' });
      }

      const payload = { username: user.username,
        userId: user.id,
        email: user.email,
        role: user.role };
      const token = await generateToken(payload);
      // @sends a message to an existing email in our database with the below email template
      const message = `<div>You are receiving this because you (or someone else) requested the reset of your password.<br> 
          Please click on the followoing link or paste this link in youre browser to complete this process within one hour: <Br> 
          http://localhost:3000/api/users/passwordreset/${token}. <br>If you did not request this ,please ignore this email and your password will remain unchanged.</div>`;
      const mailOptions = { from: 'patrick.ngabonziza@andela.com',
        to: `${user.email}`,
        subject: 'Link to reset Password',
        html: message };
      SendGrid.setApiKey(SENDGRID_API_KEY);
      SendGrid.send(mailOptions);
      return res.status(200).json({ status: 200, message: 'Check your email to reset password', token });
    } catch (error) {
      return res.status(500).json({ status: 500,
        error: 'Internal Server Error' });
    }
  }

  static async changePassword(req, res) {
    try {
      const { password } = req.body;
      const hashPassword = bcrypt.hashPasword(password);
      await User.update({ password: hashPassword }, { where: { id: req.userInfo.id } });

      res.status(200).json({ status: 200,
        message: 'your password has been updated successfully' });
    } catch (error) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async signOut(req, res) {
    try {
      const { token } = req;

      await Blacklist.create({ token });

      return res.status(200)
        .json({ message: ' Signed out ' });
    } catch (error) {
      return res.status(500)
        .json({ status: 500, Error: 'Server error' });
    }
  }

  static async verifyUser(req, res) {
    try {
      const decode = await decodeToken(req.params.userToken);
      await User.update({ verified: true }, { where: { email: decode.email } });
      return res.status(200).json({ message: 'Your account is now verified you can login with your email', });
    } catch (error) {
      return res.status(500).json(error.message);
    }
  }

  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const userData = await findUserData({ where: { id } });
      if (!userData) return res.status(404).json({ error: 'User does not exist' });
      if (userData.dataValues.roles.includes('superAdmin')) return res.status(403).json({ error: 'Not allowed to delete super admin' });

      return (await User.destroy({ where: { id } })) && res.status(200).json({ message: 'User successfully deleted' });
    } catch (error) {
      return res.status(500).json({ error: 'Server error!' });
    }
  }
}
