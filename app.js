
// Remplacez par votre config Firebase

const firebaseConfig = {
  apiKey: "AIzaSyAwIc-38_snxpqeqGyo_urnLzYBSiGVvmY",
  authDomain: "multichat-23f6a.firebaseapp.com",
  projectId: "multichat-23f6a",
  storageBucket: "multichat-23f6a.appspot.com",
  messagingSenderId: "575544919826",
  appId: "1:575544919826:web:90095bf22ee267ee4855cb"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const messagesRef = db.ref('messages');
const controlRef = db.ref('control');

const chatMessages = document.querySelector('.chat-messages');
const sendBtn = document.getElementById('sendBtn');
const messageInput = document.getElementById('message');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');

let currentUser = null;
let isAdmin = false;
let isModo = false;
let slowMode = false;
let chatBlocked = false;
let lastMsgTime = 0;


// Auth UI
loginBtn.onclick = () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(() => {
    // fallback email/password
    const email = prompt('Email:');
    const pass = prompt('Mot de passe:');
    firebase.auth().signInWithEmailAndPassword(email, pass).catch(e => alert(e.message));
  });
};
logoutBtn.onclick = () => firebase.auth().signOut();

const usersRef = db.ref('users');
let userRole = 'user';


firebase.auth().onAuthStateChanged(user => {
  currentUser = user;
  if (user) {
    loginBtn.style.display = 'none';
    logoutBtn.style.display = '';
    // Récupère le rôle depuis la base
    usersRef.child(user.uid).once('value', snap => {
      const data = snap.val();
      userRole = data && data.role ? data.role : 'user';
      isAdmin = userRole === 'admin';
      isModo = userRole === 'modo';
      sendBtn.disabled = false;
      messageInput.disabled = false;
      if (isAdmin || isModo) showModPanel();
      else hideModPanel();
      if (isAdmin) showAdminControls();
      else hideAdminControls();
    });
    // Enregistre l'utilisateur si nouveau
    usersRef.child(user.uid).update({ email: user.email, displayName: user.displayName || user.email, role: userRole });
  } else {
    loginBtn.style.display = '';
    logoutBtn.style.display = 'none';
    sendBtn.disabled = true;
    messageInput.disabled = true;
    hideAdminControls();
    hideModPanel();
  }
});




// Admin controls (admin a toutes les permissions)
function showAdminControls() {
  if (!document.getElementById('adminPanel')) {
    const panel = document.createElement('div');
    panel.id = 'adminPanel';
    panel.innerHTML = `
      <button id="blockChatBtn">Bloquer chat</button>
      <button id="unblockChatBtn">Débloquer chat</button>
      <button id="slowModeBtn">Mode ralenti</button>
      <button id="clearSlowModeBtn">Désactiver ralenti</button>
      <div id="roleManager" style="margin-top:10px;"></div>
      <div id="msgManager" style="margin-top:10px;"></div>
    `;
    document.querySelector('.chat-container').appendChild(panel);
    document.getElementById('blockChatBtn').onclick = () => controlRef.update({ chatBlocked: true });
    document.getElementById('unblockChatBtn').onclick = () => controlRef.update({ chatBlocked: false, slowMode: false });
    document.getElementById('slowModeBtn').onclick = () => controlRef.update({ slowMode: true });
    document.getElementById('clearSlowModeBtn').onclick = () => controlRef.update({ slowMode: false });
    loadUserList();
    loadMessageManager();
  }
}
function hideAdminControls() {
  const panel = document.getElementById('adminPanel');
  if (panel) panel.remove();
}

// Gestion des messages (admin peut supprimer n'importe quel message)
function loadMessageManager() {
  messagesRef.limitToLast(100).once('value', snap => {
    const messages = snap.val() || {};
    const msgManager = document.getElementById('msgManager');
    msgManager.innerHTML = '<b>Modération des messages :</b><br>';
    Object.entries(messages).forEach(([msgId, msg]) => {
      msgManager.innerHTML += `
        <div style="margin-bottom:4px;">
          <span><b>${msg.username}</b>: ${msg.text}</span>
          <button data-id="${msgId}" style="margin-left:8px;">Supprimer</button>
        </div>
      `;
    });
    msgManager.querySelectorAll('button').forEach(btn => {
      btn.onclick = function() {
        const id = this.getAttribute('data-id');
        messagesRef.child(id).remove();
        loadMessageManager();
      };
    });
  });
}

// Mod panel (admin et modo peuvent modérer le chat, ex: mode ralenti)
function showModPanel() {
  if (!document.getElementById('modPanel')) {
    const panel = document.createElement('div');
    panel.id = 'modPanel';
    panel.innerHTML = `
      <button id="slowModeBtn">Mode ralenti</button>
    `;
    document.querySelector('.chat-container').appendChild(panel);
    document.getElementById('slowModeBtn').onclick = () => controlRef.update({ slowMode: true });
  }
}
function hideModPanel() {
  const panel = document.getElementById('modPanel');
  if (panel) panel.remove();
}

// Affiche la liste des utilisateurs et permet de changer leur rôle
function loadUserList() {
  usersRef.once('value', snap => {
    const users = snap.val() || {};
    const roleManager = document.getElementById('roleManager');
    roleManager.innerHTML = '<b>Gestion des rôles :</b><br>';
    Object.entries(users).forEach(([uid, user]) => {
      roleManager.innerHTML += `
        <div style="margin-bottom:4px;">
          <span>${user.displayName || user.email}</span>
          <select data-uid="${uid}" style="margin-left:8px;">
            <option value="admin" ${user.role==='admin'?'selected':''}>admin</option>
            <option value="modo" ${user.role==='modo'?'selected':''}>modo</option>
            <option value="user" ${user.role==='user'?'selected':''}>user</option>
          </select>
        </div>
      `;
    });
    // Ajoute l'événement de modification
    roleManager.querySelectorAll('select').forEach(sel => {
      sel.onchange = function() {
        const uid = this.getAttribute('data-uid');
        const newRole = this.value;
        usersRef.child(uid).update({ role: newRole });
        if (uid === currentUser.uid) userRole = newRole;
      };
    });
  });
}

// Contrôle du mode ralenti et blocage
controlRef.on('value', snap => {
  const val = snap.val() || {};
  slowMode = !!val.slowMode;
  chatBlocked = !!val.chatBlocked;
  if (chatBlocked && !isAdmin) {
    sendBtn.disabled = true;
    messageInput.disabled = true;
  } else {
    sendBtn.disabled = false;
    messageInput.disabled = false;
  }
});

// Affichage des messages en temps réel
messagesRef.limitToLast(100).on('child_added', snapshot => {
  const msg = snapshot.val();
  addMessage(msg.username, msg.text);
});

function addMessage(username, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message';
  msgDiv.innerHTML = `<span class="username">${username}</span><span class="text">${text}</span>`;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  if (!currentUser) return alert('Connectez-vous !');
  if (chatBlocked && !isAdmin) return alert('Chat bloqué par l’admin.');
  const now = Date.now();
  if (slowMode && !isAdmin && now - lastMsgTime < 10000) return alert('Mode ralenti activé.');
  const username = currentUser.displayName || currentUser.email;
  const text = messageInput.value.trim();
  if (!text) return;
  messagesRef.push({ username, text });
  messageInput.value = '';
  lastMsgTime = now;
}

// Emoji picker natif
emojiBtn.onclick = () => {
  emojiPicker.innerHTML = '';
  emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
  if (emojiPicker.style.display === 'block') {
    // Emojis natifs
    const nativeEmojis = ['😀','😂','😍','😎','😭','😡','👍','🙏','🔥','🎉'];
    nativeEmojis.forEach(e => {
      const btn = document.createElement('button');
      btn.textContent = e;
      btn.onclick = () => {
        messageInput.value += e;
        emojiPicker.style.display = 'none';
      };
      emojiPicker.appendChild(btn);
    });
    // Emojis personnalisés
    fetch('assets/emojis/emojis.json').then(r => r.json()).then(list => {
      list.forEach(emoji => {
        const img = document.createElement('img');
        img.src = `assets/emojis/${emoji.file}`;
        img.alt = emoji.name;
        img.style.width = '32px';
        img.style.cursor = 'pointer';
        img.onclick = () => {
          messageInput.value += `:${emoji.name}:`;
          emojiPicker.style.display = 'none';
        };
        emojiPicker.appendChild(img);
      });
    });
  }
};
