"""
Python Mailer - smtplib + Gmail App Password
-----------------------------------------------
No external libraries needed (smtplib and email are built into Python).

SETUP STEPS (one-time, do this on your Gmail account):
1. Go to https://myaccount.google.com/security
2. Turn ON "2-Step Verification" if it isn't already on (required for App Passwords).
3. Go to https://myaccount.google.com/apppasswords
4. Create a new App Password (name it e.g. "CobraByte"), and Google will give
   you a 16-character password like "abcd efgh ijkl mnop".
5. Copy that 16-character password into GMAIL_APP_PASSWORD below
   (remove the spaces). Do NOT use your normal Gmail login password here.

NOTE: Never commit real credentials to GitHub. For a real project, load
GMAIL_ADDRESS and GMAIL_APP_PASSWORD from environment variables instead
of hardcoding them (see the os.environ example commented below).
"""

import smtplib
import random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ============================================================
# CONFIG - FILL THESE IN
# ============================================================
GMAIL_ADDRESS = "gmark7688@gmail.com"        # <-- your Gmail address
GMAIL_APP_PASSWORD = "mark23145"  # <-- the App Password (no spaces)

# For real projects, prefer environment variables instead, e.g.:
# import os
# GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS")
# GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
# ============================================================


def send_email(to_email, subject, body_text):
    """
    Sends a plain-text email via Gmail's SMTP server.
    Example: send_email("someone@gmail.com", "Your OTP Code", "Your code is 123456")
    """
    message = MIMEMultipart()
    message["From"] = GMAIL_ADDRESS
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(body_text, "plain"))

    try:
        # Gmail's SMTP server, port 587 uses TLS encryption
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_ADDRESS, to_email, message.as_string())
        return True
    except smtplib.SMTPAuthenticationError:
        print("Login failed. Check that GMAIL_ADDRESS and GMAIL_APP_PASSWORD are correct.")
        return False
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def generate_otp():
    """Generates a random 6-digit OTP code as a string, e.g. '048213'."""
    return str(random.randint(0, 999999)).zfill(6)


# ============================================================
# Example usage: sending an OTP verification email
# ============================================================
if __name__ == "__main__":
    otp_code = generate_otp()

    success = send_email(
        to_email="recipient@gmail.com",
        subject="CobraByte - Verify your email",
        body_text=(
            f"Your 6-digit verification code is: {otp_code}\n"
            f"This code expires in 5 minutes.\n\n"
            f"If you did not request this, you can safely ignore this email."
        )
    )

    if success:
        print(f"Email sent! (Generated OTP was: {otp_code})")
    else:
        print("Failed to send email.")