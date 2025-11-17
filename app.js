// Popup notification
function showPopup(msg) {
  const popup = document.getElementById('popup');
  popup.textContent = msg;
  popup.style.display = 'block';
  popup.style.opacity = '1';
  popup.classList.remove('hide');
  popup.classList.add('popup');
  setTimeout(() => {
    popup.style.opacity = '0';
    popup.style.display = 'none';
  }, 2000);
}

// Remplacez par votre config Firebase

const firebaseConfig = {
  apiKey: "AIzaSyAwIc-38_snxpqeqGyo_urnLzYBSiGVvmY",
  authDomain: "multichat-23f6a.firebaseapp.com",
  projectId: "multichat-23f6a",
  storageBucket: "multichat-23f6a.appspot.com",
  messagingSenderId: "575544919826",
  appId: "1:575544919826:web:90095bf22ee267ee4855cb",
  databaseURL: "https://multichat-23f6a-default-rtdb.europe-west1.firebasedatabase.app"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const messagesRef = db.ref('messages');
const controlRef = db.ref('control');

const chatMessages = document.querySelector('.chat-messages');
const sendBtn = document.getElementById('sendBtn');
const messageInput = document.getElementById('message');
const loginBtn = document.getElementById('loginBtn');
const loginEmailBtn = document.getElementById('loginEmailBtn');
const logoutBtn = document.getElementById('logoutBtn');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');
const loginContainer = document.getElementById('loginContainer');
const chatContainer = document.querySelector('.chat-container');
const colorPicker = document.getElementById('colorPicker');
// native emoji set for quick previews
const nativeEmojis = ['😀','😂','😍','😎','😭','😡','👍','🙏','🔥','🎉','🍕','🎮','✨','🎵','💯'];

// create a preview element inside emoji button for hover previews
let emojiPreviewInterval = null;
if (emojiBtn) {
  // ensure there's a preview container
  let preview = emojiBtn.querySelector('.emoji-preview');
  if (!preview) {
    preview = document.createElement('span');
    preview.className = 'emoji-preview';
    emojiBtn.appendChild(preview);
  }

  const startPreview = () => {
    // if custom emojis not loaded yet, try to load them once
    const ensureEmojis = window.customEmojis ? Promise.resolve(window.customEmojis) : fetch('emojis.json').then(r => r.json()).then(list => { window.customEmojis = list; return list; }).catch(() => []);
    ensureEmojis.then(() => {
      if (emojiPreviewInterval) return;
      emojiPreviewInterval = setInterval(() => {
        const useCustom = window.customEmojis && window.customEmojis.length && Math.random() < 0.5;
        if (useCustom) {
          const em = window.customEmojis[Math.floor(Math.random()*window.customEmojis.length)];
          // show image preview
          preview.innerHTML = '';
          const img = document.createElement('img');
          img.className = 'emoji-preview-img';
          img.src = `assets/emojis/${em.file}`;
          img.alt = em.name;
          preview.appendChild(img);
        } else {
          const e = nativeEmojis[Math.floor(Math.random()*nativeEmojis.length)];
          preview.textContent = e;
        }
      }, 700);
    }).catch(() => {});
  };

  const stopPreview = () => {
    if (emojiPreviewInterval) {
      clearInterval(emojiPreviewInterval);
      emojiPreviewInterval = null;
    }
    const prev = emojiBtn.querySelector('.emoji-preview');
    if (prev) prev.innerHTML = '';
  };

  // start/stop preview only on pointer hover (mouseenter/leave).
  // We intentionally avoid starting preview on `focus` so clicking
  // the button (which gives it focus) won't trigger the random emoji.
  emojiBtn.addEventListener('mouseenter', startPreview);
  emojiBtn.addEventListener('mouseleave', stopPreview);
}
const displayNameInput = document.getElementById('displayName');

let currentUser = null;
let isAdmin = false;
let isModo = false;
let slowMode = false;
let chatBlocked = false;
let announceMode = false;
let lastMsgTime = 0;
// Garde la trace des messages déjà affichés pour éviter les doublons
const displayedMessageKeys = new Set();

// Désactive les animations si la page a été rechargée (F5)
(function disableAnimationsOnReload() {
  try {
    let isReload = false;
    const navEntries = performance.getEntriesByType ? performance.getEntriesByType('navigation') : null;
    if (navEntries && navEntries.length > 0) {
      isReload = navEntries[0].type === 'reload';
    } else if (performance.navigation) {
      // legacy fallback
      isReload = performance.navigation.type === performance.navigation.TYPE_RELOAD;
    }
    if (isReload) {
      document.documentElement.classList.add('no-animations');
    }
  } catch (e) {
    // fail silently if performance API not available
  }
})();


// Auth UI

loginBtn.onclick = () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider);
};
loginEmailBtn.onclick = () => {
  const email = prompt('Email:');
  if (!email) {
    showPopup('Veuillez entrer un email.');
    return;
  }
  const pass = prompt('Mot de passe:');
  if (!pass) {
    showPopup('Veuillez entrer un mot de passe.');
    return;
  }
  firebase.auth().signInWithEmailAndPassword(email, pass).catch(e => showPopup(e.message));
};
logoutBtn.onclick = () => firebase.auth().signOut();

const usersRef = db.ref('users');
let userRole = 'user';
let userColor = null;
let currentUserListener = null;
// cache des users pour pouvoir mettre à jour les anciens messages
let usersCache = {};
// backup structure pour détacher/restaurer `loginContainer`
let loginContainerBackup = null;

// initialise le cache des utilisateurs (displayName) pour retrouver
// les anciens messages qui n'ont peut-être pas de data-uid
usersRef.once('value', snap => {
  const all = snap.val() || {};
  Object.entries(all).forEach(([uid, u]) => {
    usersCache[uid] = {
      name: (u && (u.displayName || u.name)) || null,
      role: (u && u.role) || null,
      color: (u && u.color) || '#9147ff'
    };
  });
});




firebase.auth().onAuthStateChanged(user => {
  currentUser = user;
  if (user) {
    // mark document as connected to enable connected-specific styles
    document.documentElement.classList.add('connected');
    // chat container visible when connected; login visibility decided after role lookup
    chatContainer.style.display = '';
    logoutBtn.style.display = '';
    // Place le bouton déconnexion à droite du champ pseudo
    if (displayNameInput && logoutBtn && displayNameInput.parentNode) {
      displayNameInput.parentNode.insertBefore(logoutBtn, displayNameInput.nextSibling);
      logoutBtn.style.marginLeft = '10px';
      logoutBtn.style.verticalAlign = 'middle';
    }
    // Récupère le rôle et la couleur depuis la base
    usersRef.child(user.uid).once('value', snap => {
      const data = snap.val();
      userRole = data && data.role ? data.role : 'user';
      userColor = data && data.color ? data.color : getRandomColor();
      isAdmin = userRole === 'admin';
      isModo = userRole === 'modo';
      sendBtn.disabled = false;
      messageInput.disabled = false;
      colorPicker.value = userColor;
      colorPicker.style.display = '';
          colorPicker.oninput = function() {
            userColor = this.value;
            // try to persist immediately to server, but keep a local pending copy
            const pending = { uid: user.uid, displayName: (displayNameInput && displayNameInput.value) ? displayNameInput.value.trim() : (user.displayName || ''), color: userColor, ts: Date.now() };
            try { localStorage.setItem('mc_pending_profile', JSON.stringify(pending)); } catch(e) {}
            usersRef.child(user.uid).update({ color: userColor }).then(() => {
              // if server update succeeds, clear pending if it matches
              try {
                const p = JSON.parse(localStorage.getItem('mc_pending_profile') || 'null');
                if (p && p.uid === user.uid && p.color === userColor) localStorage.removeItem('mc_pending_profile');
              } catch(e) {}
            }).catch(() => {});
          };
      // display name input: prefill with DB value or auth displayName
      if (displayNameInput) {
        const knownName = (data && (data.displayName || data.name)) || user.displayName || user.email || '';
        displayNameInput.value = knownName;
        displayNameInput.style.display = '';
        displayNameInput.style.width = (knownName.length * 0.75 + 2) + 'em';
        // ensure DB has displayName set
        usersRef.child(user.uid).update({ displayName: knownName });
      }
      // show admin controls in the login panel on desktop, otherwise hide
      if (isAdmin) {
        showAdminControls();
        loginContainer.style.display = '';
        // Ajoute le toggle Mode annonce à côté du bouton d’envoi si admin
        setTimeout(() => {
          if (sendBtn && !document.getElementById('toggleAnnounceMode')) {
            const announceLabel = document.createElement('label');
            announceLabel.className = 'toggle-switch';
            announceLabel.style.marginLeft = '12px';
            announceLabel.title = 'Activer le mode annonce';
            announceLabel.style.display = 'inline-block';
            announceLabel.style.verticalAlign = 'middle';
            announceLabel.innerHTML = `
              <span id="labelAnnounceMode">Annonce</span>
              <input type="checkbox" id="toggleAnnounceMode">
            `;
            // Place à droite du bouton d’envoi
            if (sendBtn.nextSibling) {
              sendBtn.parentNode.insertBefore(announceLabel, sendBtn.nextSibling.nextSibling);
            } else {
              sendBtn.parentNode.appendChild(announceLabel);
            }
            const announceToggle = document.getElementById('toggleAnnounceMode');
            if (announceToggle) {
              announceToggle.onchange = function() {
                announceMode = this.checked;
              };
              announceMode = announceToggle.checked;
            }
          }
          // Ajoute le panneau de gestion des utilisateurs dans le chat (pour admin)
          if (!document.getElementById('roleManager')) {
            const roleManager = document.createElement('div');
            roleManager.id = 'roleManager';
            roleManager.style.margin = '18px 0 0 0';
            roleManager.style.background = 'rgba(30,30,40,0.9)';
            roleManager.style.borderRadius = '8px';
            roleManager.style.padding = '12px';
            roleManager.style.maxWidth = '420px';
            roleManager.style.position = 'absolute';
            roleManager.style.right = '24px';
            roleManager.style.top = '70px';
            roleManager.style.zIndex = '20';
            chatContainer.appendChild(roleManager);
            loadUserList();
          }
        }, 300);
      } else {
        hideAdminControls();
        loginContainer.style.display = 'none';
        // Retire le toggle annonce si non admin
        const oldToggle = document.getElementById('toggleAnnounceMode');
        if (oldToggle && oldToggle.parentNode) oldToggle.parentNode.remove();
        // Retire le panneau de gestion des utilisateurs si non admin
        const oldRoleManager = document.getElementById('roleManager');
        if (oldRoleManager && oldRoleManager.parentNode) oldRoleManager.parentNode.remove();
      }
          // If there was a pending profile change saved before reload, apply it now
          try {
            const pendingRaw = localStorage.getItem('mc_pending_profile');
            if (pendingRaw) {
              const pending = JSON.parse(pendingRaw);
              if (pending && pending.uid === user.uid) {
                const updates = {};
                if (pending.displayName) updates.displayName = pending.displayName;
                if (pending.color) updates.color = pending.color;
                if (Object.keys(updates).length) {
                  usersRef.child(user.uid).update(updates).then(() => {
                    try { localStorage.removeItem('mc_pending_profile'); } catch (e) {}
                  }).catch(() => {});
                }
              }
            }
          } catch (e) {}
    });
    // attach a live listener to current user's record to detect ban/kick
    if (currentUserListener) currentUserListener.off();
    currentUserListener = usersRef.child(user.uid);
    currentUserListener.on('value', s => {
      const d = s.val() || {};
      if (d.banned) {
        showPopup('Vous avez été banni.');
        try { firebase.auth().signOut(); } catch(e) {}
      }
      if (d.kickedAt && d.kickedAt > (window.lastKickHandled || 0)) {
        window.lastKickHandled = d.kickedAt;
        showPopup('Vous avez été expulsé.');
        try { firebase.auth().signOut(); } catch(e) {}
      }
    });
    // Centre le chat si connecté
    document.querySelector('.main-layout').style.justifyContent = 'center';
    chatContainer.style.marginLeft = 'auto';
    chatContainer.style.marginRight = 'auto';
    // remove alignment classes
    chatContainer.classList.remove('left-align');
    loginContainer.classList.remove('right-align');
    // reset login margins
    loginContainer.style.marginLeft = '';
    loginContainer.style.marginRight = '';
    // Enregistre l'utilisateur si nouveau
  } else {
    // remove connected class when logged out
    document.documentElement.classList.remove('connected');
    loginContainer.style.display = '';
    chatContainer.style.display = '';
    logoutBtn.style.display = 'none';
    sendBtn.disabled = true;
    messageInput.disabled = true;
    colorPicker.style.display = 'none';
    if (displayNameInput) displayNameInput.style.display = 'none';
    hideAdminControls();
    // Colle le chat à gauche si non connecté
    document.querySelector('.main-layout').style.justifyContent = 'flex-start';
    chatContainer.style.marginLeft = '0';
    chatContainer.style.marginRight = '0';
    chatContainer.classList.add('left-align');
    chatContainer.style.height = '100vh';
    chatContainer.style.minHeight = '100vh';
    // positionne le panneau de login à droite
    loginContainer.style.marginLeft = 'auto';
    loginContainer.style.marginRight = '0';
    loginContainer.classList.add('right-align');
    // detach any user listener
    if (currentUserListener) { currentUserListener.off(); currentUserListener = null; }
  }
});

// Persist display name changes for the current user and update existing DOM
function saveDisplayNameForCurrentUser() {
  if (!currentUser) return;
  const newName = (displayNameInput.value || '').trim() || currentUser.email || '';
  // Update users node so others will see change
  // keep a pending copy in localStorage in case of reload
  try { localStorage.setItem('mc_pending_profile', JSON.stringify({ uid: currentUser.uid, displayName: newName, color: userColor, ts: Date.now() })); } catch(e) {}
  usersRef.child(currentUser.uid).update({ displayName: newName }).then(() => {
    try { const p = JSON.parse(localStorage.getItem('mc_pending_profile') || 'null'); if (p && p.uid === currentUser.uid) localStorage.removeItem('mc_pending_profile'); } catch(e) {}
  }).catch(() => {});
  // Try to update Firebase Auth profile as well
  try {
    if (currentUser.updateProfile) currentUser.updateProfile({ displayName: newName }).catch(() => {});
  } catch (e) {}
  // Update already-displayed messages for this user
  document.querySelectorAll(`.username[data-uid="${currentUser.uid}"]`).forEach(el => el.textContent = newName);
}

// Wire input events (if element exists)
if (displayNameInput) {
  displayNameInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveDisplayNameForCurrentUser();
      displayNameInput.blur();
    }
  };
  displayNameInput.onblur = () => saveDisplayNameForCurrentUser();
}

function getRandomColor() {
  // Couleurs vives, pas dans les tons du fond
  const palette = [
    '#e91e63', '#f44336', '#ff9800', '#ffc107', '#4caf50', '#00bcd4', '#2196f3', '#3f51b5', '#9c27b0', '#8bc34a', '#009688', '#cddc39', '#ffeb3b', '#ff5722', '#607d8b'
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}




// Admin controls (admin a toutes les permissions)
function showAdminControls() {
  if (!document.getElementById('adminPanel')) {
    const panel = document.createElement('div');
    panel.id = 'adminPanel';
    panel.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px; margin-bottom:10px;">
        <label class="toggle-switch" for="toggleBlockChat">
          <span id="labelBlockChat">Bloquer le chat</span>
          <input type="checkbox" id="toggleBlockChat">
        </label>
        <label class="toggle-switch" for="toggleSlowMode">
          <span id="labelSlowMode">Mode ralenti</span>
          <input type="checkbox" id="toggleSlowMode">
        </label>
        <!-- Mode annonce retiré du panneau admin -->
      </div>
      <div id="roleManager" style="margin-top:10px;"></div>
    `;
    // On desktop, REPLACE the loginContainer with admin panel (remove loginContainer from DOM)
    const useLoginPanel = (typeof window !== 'undefined' && window.innerWidth > 900 && loginContainer && loginContainer.parentNode);
    if (useLoginPanel) {
      const parent = loginContainer.parentNode;
      const next = loginContainer.nextSibling;
      // detach the original loginContainer so its state/handlers are preserved
      if (!loginContainerBackup) {
        loginContainerBackup = { el: loginContainer, parent: parent, next: next };
        parent.removeChild(loginContainer);
      }
      // insert panel where loginContainer was
      if (loginContainerBackup.next) parent.insertBefore(panel, loginContainerBackup.next);
      else parent.appendChild(panel);
    } else {
      // fallback: append into chat container (mobile)
      const target = document.querySelector('.chat-container');
      target.appendChild(panel);
    }

    // Set initial toggle states from DB
    controlRef.once('value', snap => {
      const val = snap.val() || {};
      document.getElementById('toggleBlockChat').checked = !!val.chatBlocked;
      document.getElementById('toggleSlowMode').checked = !!val.slowMode;
      document.getElementById('toggleAnnounceMode').checked = !!val.announceMode;
    });
    // Toggle handlers
    document.getElementById('toggleBlockChat').onchange = function() {
      controlRef.update({ chatBlocked: this.checked });
      if (!this.checked) controlRef.update({ slowMode: false }); // unblock disables slow mode
    };
    document.getElementById('toggleSlowMode').onchange = function() {
      controlRef.update({ slowMode: this.checked });
    };
    document.getElementById('toggleAnnounceMode').onchange = function() {
      controlRef.update({ announceMode: this.checked });
    };
    loadUserList();
  }
}
function hideAdminControls() {
  const panel = document.getElementById('adminPanel');
  if (panel) panel.remove();
  // If we had detached the original loginContainer, restore it to its original place
  if (loginContainerBackup && loginContainerBackup.el && loginContainerBackup.parent) {
    try {
      const parent = loginContainerBackup.parent;
      const next = loginContainerBackup.next;
      if (next) parent.insertBefore(loginContainerBackup.el, next);
      else parent.appendChild(loginContainerBackup.el);
    } catch (e) {}
    // clear saved backup
    loginContainerBackup = null;
  }
}

// (message manager removed — use inline delete buttons in messages)

// Mod panel (admin et modo peuvent modérer le chat, ex: mode ralenti)
// modPanel removed — moderation handled via admin panel and inline controls

// Affiche la liste des utilisateurs et permet de changer leur rôle
function loadUserList() {
  usersRef.once('value', snap => {
    const users = snap.val() || {};
    const roleManager = document.getElementById('roleManager');
    roleManager.innerHTML = '<b>Gestion des rôles :</b><br>';
    Object.entries(users).forEach(([uid, user]) => {
      roleManager.innerHTML += `
        <div style="margin-bottom:6px; display:flex; align-items:center; gap:8px;">
          <span style="flex:1;">${user.displayName || user.email}</span>
          <select data-uid="${uid}" style="margin-left:8px;">
            <option value="admin" ${user.role==='admin'?'selected':''}>admin</option>
            <option value="modo" ${user.role==='modo'?'selected':''}>modo</option>
            <option value="user" ${user.role==='user'?'selected':''}>user</option>
          </select>
          <button class="ban-btn" data-uid="${uid}" style="margin-left:6px;">${user.banned? 'Débannir' : 'Bannir'}</button>
          <button class="kick-btn" data-uid="${uid}" style="margin-left:6px;">Expulser</button>
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
    // ban / kick handlers
    roleManager.querySelectorAll('.ban-btn').forEach(btn => {
      btn.onclick = function() {
        const uid = this.getAttribute('data-uid');
        // toggle ban
        usersRef.child(uid).once('value', s => {
          const d = s.val() || {};
          const isBanned = !!d.banned;
          usersRef.child(uid).update({ banned: !isBanned });
          // reload list to update buttons
          loadUserList();
        });
      };
    });
    roleManager.querySelectorAll('.kick-btn').forEach(btn => {
      btn.onclick = function() {
        const uid = this.getAttribute('data-uid');
        // set kickedAt timestamp so client can detect and sign out
        usersRef.child(uid).update({ kickedAt: Date.now() });
      };
    });
  });
}

// Contrôle du mode ralenti et blocage + affichage status bar
controlRef.on('value', snap => {
  const val = snap.val() || {};
  slowMode = !!val.slowMode;
  chatBlocked = !!val.chatBlocked;
  // announceMode n’est plus global
  if (chatBlocked && !isAdmin) {
    sendBtn.disabled = true;
    messageInput.disabled = true;
  } else {
    sendBtn.disabled = false;
    messageInput.disabled = false;
  }
  // Update chat status bar
  let statusBar = document.getElementById('chatStatusBar');
  if (!statusBar) {
    statusBar = document.createElement('div');
    statusBar.id = 'chatStatusBar';
    statusBar.style.cssText = 'width:100%;background:#23232a;color:#fff;font-size:0.98em;padding:8px 0;text-align:center;';
    // Place le bandeau d'infos juste après le bandeau violet (header/main-layout)
    const mainLayout = document.querySelector('.main-layout');
    if (mainLayout && mainLayout.parentNode) {
      // Insère après mainLayout
      if (mainLayout.nextSibling) {
        mainLayout.parentNode.insertBefore(statusBar, mainLayout.nextSibling);
      } else {
        mainLayout.parentNode.appendChild(statusBar);
      }
    } else {
      // fallback: ajoute en haut du body
      document.body.insertBefore(statusBar, document.body.firstChild);
    }
  }
  let mods = [];
  mods.push(`<span style="color:${chatBlocked ? '#ff6b6b' : '#bbb'};font-weight:600;">Chat bloqué: ${chatBlocked ? 'activé' : 'désactivé'}</span>`);
  mods.push(`<span style="color:${slowMode ? '#3de9d6' : '#bbb'};font-weight:600;margin-left:18px;">Mode ralenti: ${slowMode ? 'activé' : 'désactivé'}</span>`);
  statusBar.innerHTML = mods.join('');
});

// Consolidated: quand un utilisateur change (couleur, displayName, ...)
// on met à jour tous les pseudos affichés.
usersRef.on('child_changed', snap => {
  const uid = snap.key;
  const data = snap.val() || {};
  if (!uid) return;
  const newColor = data.color;
  const newName = data.displayName || data.name || null;
  const oldRole = usersCache[uid] ? usersCache[uid].role : null;
  const oldName = usersCache[uid] ? usersCache[uid].name : null;

  // Mise à jour des éléments qui ont le data-uid (fiable)
  document.querySelectorAll(`.username[data-uid="${uid}"]`).forEach(el => {
    if (newColor) el.style.color = newColor || '#9147ff';
    if (newName) {
      let prefixLabel = '';
      if (data.role === 'admin') {
        prefixLabel = `<strong style="color:${newColor || '#9147ff'};">[Admin] </strong>`;
      } else if (data.role === 'modo') {
        prefixLabel = `<strong style="color:${newColor || '#9147ff'};">[Modo] </strong>`;
      }
      el.innerHTML = (prefixLabel ? prefixLabel : '') + escapeHtml(newName);
    }
  });

  // Pour les anciens messages qui n'ont pas de data-uid, on cherche
  // par nom affiché (oldName) et on remplace couleur/nom si nécessaire.
  if (oldName) {
    document.querySelectorAll('.username:not([data-uid])').forEach(el => {
      // On compare le texte sans préfixe [Admin]/[Modo]
      let txt = el.textContent.replace(/^(\[Admin\] |\[Modo\] )/, '');
      if (txt === oldName) {
        if (newColor) el.style.color = newColor || '#9147ff';
        if (newName) {
          let prefixLabel = '';
          if (data.role === 'admin') {
            prefixLabel = '[Admin] ';
          } else if (data.role === 'modo') {
            prefixLabel = '[Modo] ';
          }
          el.textContent = (prefixLabel ? prefixLabel : '') + newName;
        }
      }
    });
  }

  // met à jour le cache
  usersCache[uid] = {
    name: newName || oldName,
    role: data.role || oldRole
  };
});

// Affichage des messages en temps réel

// Au chargement, affiche les 100 derniers messages

window.addEventListener('DOMContentLoaded', () => {
  chatMessages.innerHTML = '';
  // Charge emojis.json avant d'afficher les messages
  fetch('emojis.json').then(r => r.json()).then(list => {
    window.customEmojis = list;
    messagesRef.limitToLast(100).once('value', snap => {
      const messages = snap.val() || {};
      // Parcourt les messages retournés par Firebase (avec leurs clés)
      Object.entries(messages).forEach(([key, msg]) => {
        if (!displayedMessageKeys.has(key)) {
          addMessage(msg.username, msg.text, msg.color, msg.uid, key, msg);
          displayedMessageKeys.add(key);
        }
      });
      // Scroll en bas au chargement
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  });
});

// Ajoute les nouveaux messages en temps réel
messagesRef.limitToLast(100).on('child_added', snapshot => {
  // Ignore si ce message a déjà été affiché lors du chargement initial
  const key = snapshot.key;
  if (displayedMessageKeys.has(key)) return;
  const msg = snapshot.val();
  addMessage(msg.username, msg.text, msg.color, msg.uid, key, msg);
  displayedMessageKeys.add(key);
});

// Supprime le message du DOM en temps réel si supprimé de Firebase
messagesRef.on('child_removed', snapshot => {
  const key = snapshot.key;
  // Retire du DOM
  const msgDiv = document.querySelector(`.msg-delete-btn[data-key="${key}"]`);
  if (msgDiv && msgDiv.parentNode) {
    msgDiv.parentNode.remove();
  }
  displayedMessageKeys.delete(key);
});

// Supprime les plus anciens messages si > 200
messagesRef.on('value', snap => {
  const messages = snap.val() || {};
  const keys = Object.keys(messages);
  if (keys.length > 200) {
    const toDelete = keys.slice(0, keys.length - 200);
    toDelete.forEach(key => messagesRef.child(key).remove());
  }
});

function addMessage(username, text, color) {
  // optional uid (4th) and key (5th)
  const msgUid = arguments[3] || null;
  const msgKey = arguments[4] || null;
  // Remplace :nom: par l'image SVG correspondante
  let parsedText = text;
  try {
    // Charge la liste des emojis si pas déjà en mémoire
    if (!window.customEmojis) {
      fetch('emojis.json').then(r => r.json()).then(list => {
        window.customEmojis = list;
        renderMsg();
      }).catch(() => { renderMsg(); });
      // Affiche le texte brut en attendant
      renderMsg();
      return;
    } else {
      // Parse markdown + emojis into safe HTML
      parsedText = parseDiscordMarkdown(parsedText, window.customEmojis);
    }
    renderMsg();
  } catch(e) {
    renderMsg();
  }
  function renderMsg() {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message';
    const usernameSpan = document.createElement('span');
    usernameSpan.className = 'username';
    let prefix = '';
    let prefixLabel = '';
    // Utilise la couleur actuelle de l'utilisateur (depuis usersCache)
    let userColorForMsg = color;
    if (msgUid && usersCache[msgUid]) {
      const userData = usersCache[msgUid];
      userColorForMsg = userData.color || color || '#9147ff';
      const role = userData.role || null;
      if (role === 'admin') {
        prefix = '[Admin] ';
        prefixLabel = `<strong style="color:${userColorForMsg};">[Admin] </strong>`;
      } else if (role === 'modo') {
        prefix = '[Modo] ';
        prefixLabel = `<strong style="color:${userColorForMsg};">[Modo] </strong>`;
      }
    }
    // Ajoute le préfixe stylé
    usernameSpan.innerHTML = (prefixLabel ? prefixLabel : '') + escapeHtml(username);
    usernameSpan.style.color = userColorForMsg;
    if (msgUid) usernameSpan.dataset.uid = msgUid;
    // If current client is admin/modo, show a small delete button right after the pseudo
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'msg-delete-btn';
    deleteBtn.type = 'button';
    deleteBtn.title = 'Supprimer le message';
    // use an SVG asset for the icon instead of a text glyph
    deleteBtn.innerHTML = '';
    const delImg = document.createElement('img');
    delImg.src = 'assets/delete.svg';
    delImg.alt = 'Supprimer';
    delImg.className = 'msg-delete-icon';
    deleteBtn.appendChild(delImg);
    // place a small gap to the right of the delete icon (before the username)
    deleteBtn.style.marginRight = '6px';
    deleteBtn.style.display = (isAdmin || isModo) ? '' : 'none';
    if (msgKey) {
      deleteBtn.dataset.key = msgKey;
      deleteBtn.onclick = (ev) => {
        ev.stopPropagation();
        const k = deleteBtn.dataset.key;
        if (!k) return;
        messagesRef.child(k).remove();
      };
    } else {
      deleteBtn.disabled = true;
    }
    const textSpan = document.createElement('span');
    textSpan.className = 'text';
    textSpan.innerHTML = parsedText;
    // Si annonce, applique un style spécial
    if (arguments[5] && arguments[5].announce) {
      msgDiv.classList.add('announce-message');
      textSpan.style.fontWeight = 'bold';
      textSpan.style.background = 'linear-gradient(90deg,#ffe082,#fffde7)';
      textSpan.style.borderRadius = '6px';
      textSpan.style.padding = '4px 10px';
      textSpan.style.color = '#b8860b';
    }
    // place delete button to the left of the username
    msgDiv.appendChild(deleteBtn);
    msgDiv.appendChild(usernameSpan);
    msgDiv.appendChild(textSpan);
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// Helper: escape HTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Parse a subset of Discord markdown into HTML (bold, italic, underline, strike, inline code, code blocks)
function parseDiscordMarkdown(input, emojis) {
  if (!input) return '';
  // escape first
  let s = escapeHtml(input);

  // extract fenced code blocks ```...```
  const codeBlocks = [];
  s = s.replace(/```([\s\S]*?)```/g, (m, code) => {
    codeBlocks.push(code);
    return `@@CODEBLOCK${codeBlocks.length-1}@@`;
  });

  // extract inline code `...`
  const inlineCodes = [];
  s = s.replace(/`([^`]+?)`/g, (m, code) => {
    inlineCodes.push(code);
    return `@@INLINECODE${inlineCodes.length-1}@@`;
  });

  // replace custom emojis with placeholders so formatting won't touch them
  const emojiPlaceholders = [];
  emojis.forEach((emoji, idx) => {
    const re = new RegExp(`:${emoji.name}:`, 'g');
    const tag = `<img class="emoji-inline" src="assets/emojis/${emoji.file}" alt="${emoji.name}">`;
    s = s.replace(re, `@@EMOJI${idx}@@`);
    emojiPlaceholders[idx] = tag;
  });

  // formatting: underline, bold, italic, strikethrough
  s = s.replace(/__([\s\S]+?)__/g, '<u>$1</u>');
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');
  // italic: single * or _ (avoid matching inside **)
  s = s.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/_([^_]+?)_/g, '<em>$1</em>');

  // restore inline codes
  s = s.replace(/@@INLINECODE(\d+)@@/g, (m, idx) => {
    const content = inlineCodes[Number(idx)];
    return `<code class="inline-code">${content}</code>`;
  });

  // restore fenced code blocks
  s = s.replace(/@@CODEBLOCK(\d+)@@/g, (m, idx) => {
    const content = codeBlocks[Number(idx)];
    return `<pre class="code-block"><code>${content}</code></pre>`;
  });

  // restore emojis
  s = s.replace(/@@EMOJI(\d+)@@/g, (m, idx) => emojiPlaceholders[Number(idx)] || '');

  return s;
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

function sendMessage() {
  if (!currentUser) {
    showPopup('Connectez-vous pour envoyer un message !');
    return;
  }
  if (chatBlocked && !isAdmin) {
    showPopup('Chat bloqué par l’admin.');
    return;
  }
  const now = Date.now();
  if (slowMode && !isAdmin && now - lastMsgTime < 10000) {
    showPopup('Mode ralenti activé.');
    return;
  }
  const username = currentUser.displayName || currentUser.email;
  const text = messageInput.value.trim();
  if (!text) {
    showPopup('Le message ne peut pas être vide.');
    return;
  }
  // N'enregistre plus la couleur dans le message, elle sera gérée à l'affichage
  if (announceMode && isAdmin) {
    messagesRef.push({ uid: currentUser.uid, username, text, announce: true });
  } else {
    messagesRef.push({ uid: currentUser.uid, username, text });
  }
  messageInput.value = '';
  lastMsgTime = now;
}

// Emoji picker natif — bascule la classe 'show', positionne près du bouton et ferme au clic extérieur
function populateEmojiPicker() {
  // optional uid (4th) and key (5th)
  const msgUid = arguments[3] || null;
  const msgKey = arguments[4] || null;
  // Remplace :nom: par l'image SVG correspondante
  let parsedText = text;
  try {
    // Charge la liste des emojis si pas déjà en mémoire
    if (!window.customEmojis) {
      fetch('emojis.json').then(r => r.json()).then(list => {
        window.customEmojis = list;
        renderMsg();
      }).catch(() => { renderMsg(); });
      // Affiche le texte brut en attendant
      renderMsg();
      return;
    } else {
      // Parse markdown + emojis into safe HTML
      parsedText = parseDiscordMarkdown(parsedText, window.customEmojis);
    }
    renderMsg();
  } catch(e) {
    renderMsg();
  }
  function renderMsg() {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message';
    const usernameSpan = document.createElement('span');
    usernameSpan.className = 'username';
    let prefix = '';
    let prefixLabel = '';
    // Utilise la couleur actuelle de l'utilisateur (depuis usersCache)
    let userColorForMsg = '#9147ff';
    if (msgUid && usersCache[msgUid]) {
      const userData = usersCache[msgUid];
      userColorForMsg = userData.color || '#9147ff';
      const role = userData.role || null;
      if (role === 'admin') {
        prefix = '[Admin] ';
        prefixLabel = `<strong style="color:${userColorForMsg};">[Admin] </strong>`;
      } else if (role === 'modo') {
        prefix = '[Modo] ';
        prefixLabel = `<strong style="color:${userColorForMsg};">[Modo] </strong>`;
      }
    }
    // Ajoute le préfixe stylé
    usernameSpan.innerHTML = (prefixLabel ? prefixLabel : '') + escapeHtml(username);
    usernameSpan.style.color = userColorForMsg;
    if (msgUid) usernameSpan.dataset.uid = msgUid;
    // If current client is admin/modo, show a small delete button right after the pseudo
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'msg-delete-btn';
    deleteBtn.type = 'button';
    deleteBtn.title = 'Supprimer le message';
    // use an SVG asset for the icon instead of a text glyph
    deleteBtn.innerHTML = '';
    const delImg = document.createElement('img');
    delImg.src = 'assets/delete.svg';
    delImg.alt = 'Supprimer';
    delImg.className = 'msg-delete-icon';
    deleteBtn.appendChild(delImg);
    // place a small gap to the right of the delete icon (before the username)
    deleteBtn.style.marginRight = '6px';
    deleteBtn.style.display = (isAdmin || isModo) ? '' : 'none';
    if (msgKey) {
      deleteBtn.dataset.key = msgKey;
      deleteBtn.onclick = (ev) => {
        ev.stopPropagation();
        const k = deleteBtn.dataset.key;
        if (!k) return;
        messagesRef.child(k).remove();
      };
    } else {
      deleteBtn.disabled = true;
    }
    const textSpan = document.createElement('span');
    textSpan.className = 'text';
    textSpan.innerHTML = parsedText;
    // Si annonce, applique un style spécial
    if (arguments[5] && arguments[5].announce) {
      msgDiv.classList.add('announce-message');
      textSpan.style.fontWeight = 'bold';
      textSpan.style.background = 'linear-gradient(90deg,#ffe082,#fffde7)';
      textSpan.style.borderRadius = '6px';
      textSpan.style.padding = '4px 10px';
      textSpan.style.color = '#b8860b';
    }
    // place delete button to the left of the username
    msgDiv.appendChild(deleteBtn);
    msgDiv.appendChild(usernameSpan);
    msgDiv.appendChild(textSpan);
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}
