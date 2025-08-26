import bcrypt
from functools import wraps
from flask import session, request, redirect, url_for, flash
from datetime import datetime, timedelta
import json
import os

class AuthManager:
    def __init__(self, app=None):
        self.app = app
        self.failed_attempts = {}
        self.blocked_ips = {}
        
    def init_app(self, app):
        self.app = app
        
    def hash_password(self, password):
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    
    def verify_password(self, password, hashed):
        return bcrypt.checkpw(password.encode('utf-8'), hashed)
    
    def is_ip_blocked(self, ip):
        if ip in self.blocked_ips:
            if datetime.now() > self.blocked_ips[ip]:
                del self.blocked_ips[ip]
                return False
            return True
        return False
    
    def record_failed_attempt(self, ip):
        if ip not in self.failed_attempts:
            self.failed_attempts[ip] = []
        
        self.failed_attempts[ip].append(datetime.now())
        
        # Remove attempts older than 15 minutes
        cutoff = datetime.now() - timedelta(minutes=15)
        self.failed_attempts[ip] = [
            attempt for attempt in self.failed_attempts[ip] 
            if attempt > cutoff
        ]
        
        # Block IP if too many attempts
        if len(self.failed_attempts[ip]) >= self.app.config['MAX_LOGIN_ATTEMPTS']:
            self.blocked_ips[ip] = datetime.now() + timedelta(
                seconds=self.app.config['LOGIN_TIMEOUT']
            )
            return True
        return False
    
    def authenticate(self, password):
        from config.config import Config
        # Simple password check - in production, use proper user management
        return password == Config.DEFAULT_PASSWORD
    
    def login_required(self, f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'logged_in' not in session:
                return redirect(url_for('login'))
            return f(*args, **kwargs)
        return decorated_function

auth_manager = AuthManager()