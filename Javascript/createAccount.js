const signupBtn = document.getElementById('signup-btn');

async function parseResponseData(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return { message: text || 'Unexpected server response.' };
}

if (signupBtn) {
  signupBtn.addEventListener('click', async function () {
    const fullName = document.getElementById('signup-name').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const pin = document.getElementById('signup-pin').value.trim();

    if (!fullName) {
      alert('Name is required.');
      return;
    }

    if (!/^\d{11}$/.test(phone)) {
      alert('Phone number must be 11 digits.');
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      alert('PIN must be 4 digits.');
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phone, pin })
      });
      const data = await parseResponseData(response);
      if (!response.ok) {
        alert(data.message || 'Sign up failed.');
        return;
      }

      alert('Account created. Please sign in.');
      window.location.assign('./index.html');
    } catch (error) {
      console.error(error);
      alert('Could not connect to server. Please make sure the backend server is running.');
    }
  });
}
