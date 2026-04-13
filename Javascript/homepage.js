const formlist={
    addBtn:'addMoney',
    cashoutBtn:'cashOut',
    TransferBtn:'Transfer',
    getBtn:'getBonus',
    payBtn:'payBill',
    transactionBtn:'transactions'
};

let demoGuide = null;

function hideAllServiceForms() {
const formIds=['addMoney','cashOut','Transfer','getBonus','payBill','transactions'];

for (const formId of formIds) {
const form = document.getElementById(formId);
if (!form) continue;
form.classList.add('hidden');
}
}

function renderDemoGuide() {
if (!demoGuide) return;

demoGuide.classList.remove('hidden');
demoGuide.innerHTML = `
<div class="card bg-base-100 w-11/12 mx-auto  shrink-0 shadow rounded-2xl   ">
      <div class="card-body">
        <fieldset class="fieldset">
          <p class="text-primary   text-xl text-center font-medium ">Click a Button to Select A Service</p>
    
        </fieldset>
      </div>
    </div>
`;
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('trustpay_user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function isGuestUser(user) {
  return Boolean(user && user.isGuest);
}

function requireMemberUser() {
  const user = getCurrentUser();
  if (!user || !user.id || isGuestUser(user)) {
    alert('Guest mode is view-only. Please sign in to use this service.');
    return null;
  }
  return user;
}

function saveCurrentUser(user) {
  localStorage.setItem('trustpay_user', JSON.stringify(user));
}

function setBalance(balance) {
  const balanceEl = document.getElementById('currentBalance');
  if (!balanceEl) return;
  balanceEl.innerText = Number(balance).toFixed(2);
}

async function refreshBalance() {
  const user = getCurrentUser();
  if (!user || !user.id) return;

  try {
    const response = await fetch(`/api/users/${user.id}/balance`);
    const data = await response.json();
    if (!response.ok) return;

    const updated = data.user;
    saveCurrentUser(updated);
    setBalance(updated.balance);
  } catch (error) {
    console.error(error);
  }
}

async function postJSON(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  return { response, data };
}

function initUser() {
  const user = getCurrentUser();
  if (!user) {
    window.location.assign('./index.html');
    return;
  }
  if (isGuestUser(user)) {
    setBalance(0);
    const guestNotice = document.getElementById('guest-mode-notice');
    if (guestNotice) {
      guestNotice.classList.remove('hidden');
    }
    return;
  }

  if (!user.id) {
    window.location.assign('./index.html');
    return;
  }

  setBalance(user.balance || 0);
  refreshBalance();
}

function initActions() {
  const addMoneyBtn = document.getElementById('addmoney-btn');
  const cashoutBtn = document.getElementById('cashout-btn');
  const transferBtn = document.getElementById('transfer-btn');
  const getBonusBtn = document.getElementById('getbonus-btn');
  const payBillBtn = document.getElementById('paybill-btn');
  const transactionsRefreshBtn = document.getElementById('transactions-refresh');
  const logoutLink = document.getElementById('logout-link');

  if (logoutLink) {
    logoutLink.addEventListener('click', function () {
      localStorage.removeItem('trustpay_user');
    });
  }

  if (addMoneyBtn) {
    addMoneyBtn.addEventListener('click', async function () {
      const user = requireMemberUser();
      if (!user) return;

      const amount = document.getElementById('addmoney-amount').value.trim();
      const pin = document.getElementById('addmoney-pin').value.trim();

      if (!amount || Number(amount) <= 0) {
        alert('Enter a valid amount.');
        return;
      }

      if (!/^\d{4}$/.test(pin)) {
        alert('PIN must be 4 digits.');
        return;
      }

      try {
        const { response, data } = await postJSON('/api/transactions/add-money', {
          userId: user.id,
          amount,
          pin
        });

        if (!response.ok) {
          alert(data.message || 'Add money failed.');
          return;
        }

        user.balance = data.balance;
        saveCurrentUser(user);
        setBalance(data.balance);
        alert(data.message || 'Money added successfully.');
      } catch (error) {
        console.error(error);
        alert('Could not connect to server.');
      }
    });
  }

  if (cashoutBtn) {
    cashoutBtn.addEventListener('click', async function () {
      const user = requireMemberUser();
      if (!user) return;

      const agentPhone = document.getElementById('cashout-agent').value.trim();
      const amount = document.getElementById('cashout-amount').value.trim();
      const pin = document.getElementById('cashout-pin').value.trim();

      if (!/^\d{11}$/.test(agentPhone)) {
        alert('Agent number must be 11 digits.');
        return;
      }

      if (!amount || Number(amount) <= 0) {
        alert('Enter a valid amount.');
        return;
      }

      if (!/^\d{4}$/.test(pin)) {
        alert('PIN must be 4 digits.');
        return;
      }

      try {
        const { response, data } = await postJSON('/api/transactions/cashout', {
          userId: user.id,
          agentPhone,
          amount,
          pin
        });

        if (!response.ok) {
          alert(data.message || 'Cash out failed.');
          return;
        }

        user.balance = data.balance;
        saveCurrentUser(user);
        setBalance(data.balance);
        alert(data.message || 'Cash out successful.');
      } catch (error) {
        console.error(error);
        alert('Could not connect to server.');
      }
    });
  }

  if (transferBtn) {
    transferBtn.addEventListener('click', async function () {
      const user = requireMemberUser();
      if (!user) return;

      const receiverPhone = document.getElementById('transfer-receiver').value.trim();
      const amount = document.getElementById('transfer-amount').value.trim();
      const pin = document.getElementById('transfer-pin').value.trim();

      if (!/^\d{11}$/.test(receiverPhone)) {
        alert('Receiver account must be 11 digits.');
        return;
      }

      if (!amount || Number(amount) <= 0) {
        alert('Enter a valid amount.');
        return;
      }

      if (!/^\d{4}$/.test(pin)) {
        alert('PIN must be 4 digits.');
        return;
      }

      try {
        const { response, data } = await postJSON('/api/transactions/transfer', {
          userId: user.id,
          receiverPhone,
          amount,
          pin
        });

        if (!response.ok) {
          alert(data.message || 'Transfer failed.');
          return;
        }

        user.balance = data.balance;
        saveCurrentUser(user);
        setBalance(data.balance);
        alert(data.message || 'Transfer successful.');
      } catch (error) {
        console.error(error);
        alert('Could not connect to server.');
      }
    });
  }

  if (getBonusBtn) {
    getBonusBtn.addEventListener('click', async function () {
      const user = requireMemberUser();
      if (!user) return;

      const bonusCode = document.getElementById('getbonus-code').value.trim();
      const pin = document.getElementById('getbonus-pin').value.trim();

      if (bonusCode.length < 6) {
        alert('Bonus code must be at least 6 characters.');
        return;
      }

      if (!/^\d{4}$/.test(pin)) {
        alert('PIN must be 4 digits.');
        return;
      }

      try {
        const { response, data } = await postJSON('/api/transactions/get-bonus', {
          userId: user.id,
          bonusCode,
          pin
        });

        if (!response.ok) {
          alert(data.message || 'Get bonus failed.');
          return;
        }

        user.balance = data.balance;
        saveCurrentUser(user);
        setBalance(data.balance);
        document.getElementById('getbonus-code').value = '';
        document.getElementById('getbonus-pin').value = '';
        alert(data.message || 'Bonus added successfully.');
      } catch (error) {
        console.error(error);
        alert('Could not connect to server.');
      }
    });
  }

  if (payBillBtn) {
    payBillBtn.addEventListener('click', async function () {
      const user = requireMemberUser();
      if (!user) return;

      const billType = document.getElementById('paybill-type').value.trim();
      const billNumber = document.getElementById('paybill-number').value.trim();
      const amount = document.getElementById('paybill-amount').value.trim();
      const pin = document.getElementById('paybill-pin').value.trim();

      if (!billType) {
        alert('Please select a bill type.');
        return;
      }

      if (billNumber.length < 6) {
        alert('Bill number must be at least 6 characters.');
        return;
      }

      if (!amount || Number(amount) <= 0) {
        alert('Enter a valid amount.');
        return;
      }

      if (!/^\d{4}$/.test(pin)) {
        alert('PIN must be 4 digits.');
        return;
      }

      try {
        const { response, data } = await postJSON('/api/transactions/pay-bill', {
          userId: user.id,
          billType,
          billNumber,
          amount,
          pin
        });

        if (!response.ok) {
          alert(data.message || 'Pay bill failed.');
          return;
        }

        user.balance = data.balance;
        saveCurrentUser(user);
        setBalance(data.balance);
        document.getElementById('paybill-type').value = '';
        document.getElementById('paybill-number').value = '';
        document.getElementById('paybill-amount').value = '';
        document.getElementById('paybill-pin').value = '';
        alert(data.message || 'Bill paid successfully.');
      } catch (error) {
        console.error(error);
        alert('Could not connect to server.');
      }
    });
  }

  if (transactionsRefreshBtn) {
    transactionsRefreshBtn.addEventListener('click', function () {
      loadTransactions();
    });
  }
}

function toggleform(activeId){
const formIds=['addMoney','cashOut','Transfer','getBonus','payBill','transactions'];

hideAllServiceForms();

for(const formId of formIds ){
const form=document.getElementById(formId);

if(!form) continue;

if(formId===formlist[activeId]){
form.classList.remove('hidden');


} else{

    form.classList.add('hidden');
}
}

if (demoGuide) {
  demoGuide.classList.add('hidden');
}

}

async function loadTransactions() {
  const user = getCurrentUser();
  if (!user || !user.id || isGuestUser(user)) return;

  try {
    const transactionsContainer = document.getElementById('transactions-list');
    if (!transactionsContainer) return;

    transactionsContainer.innerHTML = '<p class="text-center text-gray-500">Loading transactions...</p>';
    const response = await fetch(`/api/transactions/${user.id}`);
    const data = await response.json();
    if (!response.ok) {
      alert('Failed to load transactions.');
      return;
    }

    transactionsContainer.innerHTML = '';

    if (!data.transactions || data.transactions.length === 0) {
      transactionsContainer.innerHTML = '<p class="text-center text-gray-500">No transactions found.</p>';
      return;
    }
    const incomingTypes = ['add_money', 'transfer_in', 'bonus'];
    const typeLabel = {
      add_money: 'Add Money',
      cashout: 'Cash Out',
      transfer_in: 'Transfer In',
      transfer_out: 'Transfer Out',
      bonus: 'Bonus',
      bill_pay: 'Bill Payment'
    };

    data.transactions.forEach(tx => {
      const txElement = document.createElement('div');
      txElement.className = 'flex justify-between items-center p-3 bg-base-200 rounded-lg mb-2';
      const amount = Number(tx.amount) || 0;
      const isIncoming = incomingTypes.includes(tx.type);
      const sign = isIncoming ? '+' : '-';
      const amountClass = isIncoming ? 'text-success' : 'text-error';
      txElement.innerHTML = `
        <div>
          <p class="font-semibold">${typeLabel[tx.type] || tx.type}</p>
          <p class="text-sm text-gray-600">${new Date(tx.createdAt).toLocaleString()}</p>
          ${tx.referencePhone ? `<p class="text-xs text-gray-500">Ref: ${tx.referencePhone}</p>` : ''}
          ${tx.note ? `<p class="text-xs text-gray-500">${tx.note}</p>` : ''}
        </div>
        <div class="text-right">
          <p class="font-bold ${amountClass}">${sign}৳${amount.toFixed(2)}</p>
        </div>
      `;
      transactionsContainer.appendChild(txElement);
    });
  } catch (error) {
    console.error(error);
    alert('Could not load transactions.');
  }
}

function buttonToggle(Id){
const user = getCurrentUser();
if (isGuestUser(user)) {
alert('Guest mode is view-only. Please sign in to use services.');
return;
}

const ids=['addBtn','cashoutBtn','TransferBtn','getBtn','payBtn','transactionBtn']

for(const id of ids){

const btn=document.getElementById(id);

if(!btn) continue;
if( id===Id){
btn.classList.add("Active");
btn.classList.remove("Remove");

}
else{
btn.classList.remove("Active");
btn.classList.add("Remove");

}


}

if(formlist[Id]){
    toggleform(Id);
}

if (Id === 'transactionBtn') {
  loadTransactions();
}

}

window.addEventListener('DOMContentLoaded',function(){
demoGuide = document.getElementById('default');

hideAllServiceForms();
renderDemoGuide();



if (typeof initUser === 'function') {
  initUser();
}

if (typeof initActions === 'function') {
  initActions();
}



})