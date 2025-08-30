from flask import Blueprint, render_template, request, redirect, url_for, flash, session, make_response
from . import auth_manager

auth_bp = Blueprint('auth', __name__, template_folder='../../templates', static_folder='../../static')

@auth_bp.route('/')
@auth_manager.login_required  
def dashboard():
    response = make_response(render_template('dashboard.html'))
    response.headers['Cache-Control'] = 'public, max-age=300'
    return response

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        password = request.form.get('password')
        client_ip = request.remote_addr
        
        if auth_manager.is_ip_blocked(client_ip):
            flash('Too many failed attempts. Please try again later.', 'error')
            return render_template('login.html')
        
        if auth_manager.authenticate(password):
            session['logged_in'] = True
            session.permanent = True
            return redirect(url_for('auth.dashboard'))
        else:
            is_blocked = auth_manager.record_failed_attempt(client_ip)
            if is_blocked:
                flash('Too many failed attempts. IP blocked temporarily.', 'error')
            else:
                flash('Invalid password', 'error')
    
    return render_template('login.html')

@auth_bp.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('auth.login'))
