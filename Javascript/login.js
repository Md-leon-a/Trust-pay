const loginBtn = document.getElementById('login-btn');
const createBtn = document.getElementById('create');
const guestBtn = document.getElementById('guest-btn');

async function parseResponseData(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();
    return { message: text || 'Unexpected server response.' };
}

if (loginBtn) {
    loginBtn.addEventListener('click', async function () {
        const phone = document.getElementById('login-phone').value.trim();
        const pin = document.getElementById('login-pin').value.trim();

        if (!/^\d{11}$/.test(phone)) {
            alert('Phone number must be 11 digits.');
            return;
        }

        if (!/^\d{4}$/.test(pin)) {
            alert('PIN must be 4 digits.');
            return;
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, pin })
            });
            const data = await parseResponseData(response);
            if (!response.ok) {
                alert(data.message || 'Sign in failed.');
                return;
            }

            localStorage.setItem('trustpay_user', JSON.stringify(data.user));
            window.location.assign('./homepage.html');
        } catch (error) {
            console.error(error);
            alert('Could not connect to server. Please make sure the backend server is running.');
        }
    });
}

if (createBtn) {
    createBtn.addEventListener('click', function () {
        window.location.assign('./CreateAccount.html');
    });
}
if (guestBtn) {
    guestBtn.addEventListener('click', function () {
        const guestUser = {
            id: null,
            fullName: 'Guest User',
            phone: '',
            balance: 0,
            isGuest: true
        };

        localStorage.setItem('trustpay_user', JSON.stringify(guestUser));
        window.location.assign('./homepage.html');
    });
}
