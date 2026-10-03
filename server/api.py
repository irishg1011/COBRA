"""
api.py - Gmail Mailer & OTP Generator
------------------------------------
Handles sending emails via Gmail SMTP using an App Password.
"""

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import random
import smtplib

# ============================================================
# CONFIG - GMAIL CREDENTIALS
# ============================================================
GMAIL_ADDRESS = "cobra.ofcsystem@gmail.com"
GMAIL_APP_PASSWORD = "djtagpiyhdnuetps"  # 16-character App Password (no spaces)
# ============================================================


def generate_otp():
    """Generates a random 6-digit OTP code as a string, e.g. '048213'."""
    return str(random.randint(0, 999999)).zfill(6)


def send_email(to_email, subject, body_text, reply_to=None):
    """
    Sends a plain-text email via Gmail's SMTP server using TLS encryption.
    reply_to (optional): where a "Reply" in the inbox should go - used for
    landing page messages, so replying reaches the visitor (feat/contact-messages).
    Returns True when the email was sent, False otherwise.
    """
    message = MIMEMultipart()
    message["From"] = GMAIL_ADDRESS
    message["To"] = to_email
    message["Subject"] = subject
    if reply_to:
        message["Reply-To"] = reply_to
    message.attach(MIMEText(body_text, "plain"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_ADDRESS, to_email, message.as_string())
        return True
    except smtplib.SMTPAuthenticationError:
        print("Login failed. Check GMAIL_ADDRESS and GMAIL_APP_PASSWORD.")
        return False
    except Exception as e:
        print(f"Error sending email: {e}")
        return False