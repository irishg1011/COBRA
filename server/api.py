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
GMAIL_ADDRESS = "gmark7688@gmail.com"
GMAIL_APP_PASSWORD = "wwppfzltxqtcgffq"  # 16-character App Password (no spaces)
# ============================================================


def generate_otp():
    """Generates a random 6-digit OTP code as a string, e.g. '048213'."""
    return str(random.randint(0, 999999)).zfill(6)


def send_email(to_email, subject, body_text):
    """
    Sends a plain-text email via Gmail's SMTP server using TLS encryption.
    """
    message = MIMEMultipart()
    message["From"] = GMAIL_ADDRESS
    message["To"] = to_email
    message["Subject"] = subject
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