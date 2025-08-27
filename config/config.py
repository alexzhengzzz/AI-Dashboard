import os
from datetime import timedelta
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-key-change-in-production'
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True
    SESSION_KEY_PREFIX = 'dashboard:'
    PERMANENT_SESSION_LIFETIME = timedelta(hours=2)
    
    # Security settings
    SESSION_COOKIE_SECURE = False  # Set to True when using HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Dashboard settings
    REFRESH_INTERVAL = 5  # seconds
    MAX_LOGIN_ATTEMPTS = 5
    LOGIN_TIMEOUT = 300  # seconds
    
    # Default admin password - MUST be set via environment variable in production
    DEFAULT_PASSWORD = os.environ.get('DASHBOARD_PASSWORD') or 'CHANGE_ME_IN_PRODUCTION'