import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = nodemailer.createTransport({
  host: process.env.MAILTRAP_HOST,
  port: process.env.MAILTRAP_PORT,
  auth: {
    user: process.env.MAILTRAP_USER,
    pass: process.env.MAILTRAP_PASS,
  },
});

function loadTemplate(templateName) {
  const filePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
  return fs.readFileSync(filePath, 'utf-8');
}

function fillTemplate(html, variables) {
  let result = html;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

async function sendEmail({ to, subject, html, template }) {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html,
    });
    db.prepare(`
      INSERT INTO email_log (id, to_address, subject, template, status)
      VALUES (?, ?, ?, ?, 'sent')
    `).run(uuidv4(), to, subject, template || 'unknown');
  } catch (err) {
    db.prepare(`
      INSERT INTO email_log (id, to_address, subject, template, status, error)
      VALUES (?, ?, ?, ?, 'failed', ?)
    `).run(uuidv4(), to, subject, template || 'unknown', err.message);
    throw err;
  }
}

async function sendSignupApproved(to, name) {
  const html = fillTemplate(loadTemplate('signup-approved'), { name });
  return sendEmail({ to, subject: 'Your Liquidity.ai account is approved!', html, template: 'signup-approved' });
}

async function sendSignupDenied(to, name, reason) {
  const html = fillTemplate(loadTemplate('signup-denied'), { name, reason });
  return sendEmail({ to, subject: 'Your Liquidity.ai application was not approved', html, template: 'signup-denied' });
}

async function sendPasswordReset(to, name, resetLink) {
  const html = fillTemplate(loadTemplate('password-reset'), { name, resetLink });
  return sendEmail({ to, subject: 'Reset your Liquidity.ai password', html, template: 'password-reset' });
}

async function sendSecurityAlert(to, name, details) {
  const html = fillTemplate(loadTemplate('security-alert'), { name, details });
  return sendEmail({ to, subject: '⚠️ Security Alert — Liquidity.ai!', html, template: 'security-alert' });
}

export {
  sendSignupApproved,
  sendSignupDenied,
  sendPasswordReset,
  sendSecurityAlert,
};
