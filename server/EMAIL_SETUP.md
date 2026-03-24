# Email System - Setup and Documentation

## Overview

This project uses Nodemailer to send transactional emails triggered by user management actions in the dashboard. Emails are currently configured to use Mailtrap for testing. This document covers the current setup and how to add new email types.

---

## Current Setup (Mailtrap - Testing)

### What is Mailtrap?

Mailtrap is an email sandbox tool that catches all outgoing emails and displays them in a test inbox. No real emails are ever delivered to users. It is used during development and testing only.

### Files

    server/
    lib/
        email.js - Nodemailer config and 4 send functions
    templates/
        signup-approved.html
        signup-denied.html
        password-reset.html
        security-alert.html

### Environment Variables

Add these to your .env file:

    MAILTRAP_HOST=sandbox.smtp.mailtrap.io
    MAILTRAP_PORT=2525
    MAILTRAP_USER=your_mailtrap_username
    MAILTRAP_PASS=your_mailtrap_password
    MAIL_FROM=noreply@liquidity.ai

### Getting Mailtrap Credentials

1. Go to mailtrap.io and create a free account
2. Create a sandbox inbox e.g. liquidity-dev
3. Click into the inbox and go to the Integration tab
4. Select Nodemailer from the dropdown
5. Copy the user and pass values into your .env file

---

## Email Triggers

The following table shows what triggers each email:

| User Action | Function Called | Template Used |
|---|---|---|
| Admin approves a user | sendSignupApproved(email, name) | signup-approved.html |
| Admin denies a user | sendSignupDenied(email, name, reason) | signup-denied.html |
| Admin force resets password | sendPasswordReset(email, name, resetLink) | password-reset.html |
| 5 failed login attempts | sendSecurityAlert(email, name, details) | security-alert.html |

### Where they are wired in

- server/routes/userRoutes.js - approve and deny routes
- server/routes/authRoutes.js - account lockout route

---

## How the Template System Works

Templates use double curly brace placeholder syntax for dynamic values. Example:

    Hi {{name}},

The fillTemplate() function in email.js loops through the variables object and replaces each placeholder with the real value before the email is sent.

    function fillTemplate(html, variables) {
      let result = html;
      for (const [key, value] of Object.entries(variables)) {
        result = result.replaceAll(String.fromCharCode(123,123) + key + String.fromCharCode(125,125), value);
      }
      return result;
    }

---

## Testing Emails Individually

Run these commands one at a time from the project root. Each sends one email to your Mailtrap inbox.

Test signup approved:

    node -e "import('./server/lib/email.js').then(m => m.sendSignupApproved('test@example.com', 'Test User').then(() => console.log('sent')).catch(console.error))"

Test signup denied:

    node -e "import('./server/lib/email.js').then(m => m.sendSignupDenied('test@example.com', 'Test User', 'Incomplete documentation').then(() => console.log('sent')).catch(console.error))"

Test password reset:

    node -e "import('./server/lib/email.js').then(m => m.sendPasswordReset('test@example.com', 'Test User', 'http://localhost:5173/reset?token=abc123').then(() => console.log('sent')).catch(console.error))"

Test security alert:

    node -e "import('./server/lib/email.js').then(m => m.sendSecurityAlert('test@example.com', 'Test User', 'Login from unknown IP 192.168.1.1').then(() => console.log('sent')).catch(console.error))"

---

## Adding a New Email Type

Follow these 4 steps to add a new email notification to the system.

Step 1 - Create the HTML template

Add a new file in server/templates/ for example my-new-email.html
Use double curly brace placeholders for any dynamic values like name or reason.

Step 2 - Add a send function in server/lib/email.js

Follow this pattern:

    async function sendMyNewEmail(to, name) {
      const html = fillTemplate(loadTemplate('my-new-email'), { name });
      return sendEmail({ to, subject: 'Your subject here', html });
    }

Step 3 - Export the function

Add it to the export block at the bottom of email.js:

    export {
      sendSignupApproved,
      sendSignupDenied,
      sendPasswordReset,
      sendSecurityAlert,
      sendMyNewEmail,
    };

Step 4 - Import and call it in the relevant route

    import { sendMyNewEmail } from '../lib/email.js';

    sendMyNewEmail(user.email, user.display_name)
      .catch(err => console.error('Email failed:', err.message));

---

## Important Notes for Developers

### .env is gitignored

The .env file is never committed to GitHub. Each developer needs their own .env file with their own Mailtrap credentials. See .env.example for the list of required variables.

### Emails fail silently

Email sending uses .catch() instead of await so a failed email never breaks the main API response. Errors are logged to the server console. In production consider connecting these errors to a logging service.

## Email Logging

Every email sent or failed is automatically recorded in the email_log table in the database.

The table stores:

- id - unique record ID
- to_address - recipient email
- subject - email subject line
- template - which template was used
- status - either sent or failed
- error - error message if failed, null if successful
- sent_at - timestamp of when it was attempted

To query the log directly:

    node -e "import('./server/db.js').then(m => { const logs = m.db.prepare('SELECT * FROM email_log ORDER BY sent_at DESC').all(); console.log(JSON.stringify(logs, null, 2)); })"

