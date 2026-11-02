/**
 * script.js — Expense Tracker
 * ============================================================
 * Handles:
 *   - CRUD  : Create, Read, Update, Delete transactions
 *   - Summary : Balance, total income, total expense (auto-calc)
 *   - Filter  : by description search, category, and type
 *   - Storage : Persist data in LocalStorage
 * ============================================================
 */

'use strict';

/* ============================================================
   CONSTANTS & STATE
   ============================================================ */

/** LocalStorage key */
const STORAGE_KEY = 'expense_tracker_transactions';

/**
 * Emoji map for each category (used in list items).
 * @type {Record<string, string>}
 */
const CATEGORY_EMOJI = {
  Makanan:       '🍔',
  Transportasi:  '🚗',
  Hiburan:       '🎮',
  Kesehatan:     '🏥',
  Belanja:       '🛍️',
  Tagihan:       '💡',
  Gaji:          '💼',
  Investasi:     '📈',
  Lainnya:       '📦',
};

/**
 * Background colour for the icon badge per category.
 * @type {Record<string, string>}
 */
const CATEGORY_BG = {
  Makanan:       'bg-orange-100',
  Transportasi:  'bg-sky-100',
  Hiburan:       'bg-purple-100',
  Kesehatan:     'bg-green-100',
  Belanja:       'bg-pink-100',
  Tagihan:       'bg-yellow-100',
  Gaji:          'bg-blue-100',
  Investasi:     'bg-teal-100',
  Lainnya:       'bg-slate-100',
};

/** In-memory array of transaction objects */
let transactions = [];

/** ID of the transaction currently being edited (null = create mode) */
let editingId = null;

/** ID staged for deletion (confirmed via modal) */
let deletingId = null;

/* ============================================================
   DOM REFERENCES
   ============================================================ */

const form              = document.getElementById('transaction-form');
const inputDescription  = document.getElementById('input-description');
const inputAmount       = document.getElementById('input-amount');
const inputCategory     = document.getElementById('input-category');
const inputDate         = document.getElementById('input-date');
const editIdField       = document.getElementById('edit-id');
const formTitle         = document.getElementById('form-title');
const btnSubmit         = document.getElementById('btn-submit');
const btnCancel         = document.getElementById('btn-cancel');

const errDescription    = document.getElementById('err-description');
const errAmount         = document.getElementById('err-amount');

const displayBalance    = document.getElementById('display-balance');
const displayIncome     = document.getElementById('display-income');
const displayExpense    = document.getElementById('display-expense');

const transactionList   = document.getElementById('transaction-list');
const emptyState        = document.getElementById('empty-state');
const transactionCount  = document.getElementById('transaction-count');

const filterSearch      = document.getElementById('filter-search');
const filterCategory    = document.getElementById('filter-category');
const filterType        = document.getElementById('filter-type');

const modalOverlay      = document.getElementById('modal-overlay');
const modalCancel       = document.getElementById('modal-cancel');
const modalConfirm      = document.getElementById('modal-confirm');

/* ============================================================
   LOCALSTORAGE HELPERS
   ============================================================ */

/**
 * Load transactions array from LocalStorage.
 * Returns an empty array if nothing is stored yet.
 * @returns {Array<Object>}
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persist the current in-memory transactions array to LocalStorage.
 */
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/* ============================================================
   UTILITY HELPERS
   ============================================================ */

/**
 * Format a number to Indonesian Rupiah string.
 * @param {number} amount
 * @returns {string}  e.g. "Rp 1.500.000"
 */
function formatRupiah(amount) {
  return 'Rp ' + Math.abs(amount).toLocaleString('id-ID');
}

/**
 * Generate a simple unique ID based on timestamp + random suffix.
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Return today's date as "YYYY-MM-DD" for the date input default value.
 * @returns {string}
 */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Format an ISO date string to a human-friendly Indonesian date.
 * @param {string} iso  "YYYY-MM-DD"
 * @returns {string}    e.g. "15 Jan 2025"
 */
function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00'); // avoid timezone shift
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ============================================================
   SUMMARY CALCULATION
   ============================================================ */

/**
 * Re-compute balance / income / expense totals from the full
 * transactions array and update the summary cards in the DOM.
 */
function updateSummary() {
  const totalIncome  = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpense;

  displayBalance.textContent = formatRupiah(balance);
  displayIncome.textContent  = formatRupiah(totalIncome);
  displayExpense.textContent = formatRupiah(totalExpense);

  // Colour the balance card based on positive / negative
  const cardBalance = document.getElementById('card-balance');
  if (balance < 0) {
    cardBalance.classList.replace('bg-primary', 'bg-expense');
  } else {
    cardBalance.classList.replace('bg-expense', 'bg-primary');
  }
}

/* ============================================================
   RENDER — TRANSACTION LIST
   ============================================================ */

/**
 * Build and insert a single <li> element for a transaction.
 * @param {Object} tx  Transaction object
 * @returns {HTMLLIElement}
 */
function createTransactionElement(tx) {
  const isIncome = tx.type === 'income';
  const li = document.createElement('li');
  li.className = 'tx-item';
  li.dataset.id = tx.id;

  li.innerHTML = `
    <!-- Category icon badge -->
    <div class="tx-icon ${CATEGORY_BG[tx.category] || 'bg-slate-100'}"
         aria-hidden="true">
      ${CATEGORY_EMOJI[tx.category] || '📦'}
    </div>

    <!-- Description + meta -->
    <div class="flex-1 min-w-0">
      <p class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(tx.description)}</p>
      <p class="text-xs text-slate-400 mt-0.5">
        ${tx.category} · ${formatDate(tx.date)}
      </p>
    </div>

    <!-- Amount -->
    <div class="text-right flex-shrink-0">
      <p class="text-sm font-bold ${isIncome ? 'text-income' : 'text-expense'}">
        ${isIncome ? '+' : '-'} ${formatRupiah(tx.amount)}
      </p>
      <p class="text-xs text-slate-400 mt-0.5">
        ${isIncome ? 'Pemasukan' : 'Pengeluaran'}
      </p>
    </div>

    <!-- Action buttons -->
    <div class="flex flex-col gap-1 flex-shrink-0" role="group" aria-label="Aksi">
      <button class="btn-edit" data-action="edit" data-id="${tx.id}"
              title="Edit transaksi" aria-label="Edit ${escapeHtml(tx.description)}">
        <!-- Pencil icon -->
        <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor"
             stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0
               012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z"/>
        </svg>
      </button>
      <button class="btn-delete" data-action="delete" data-id="${tx.id}"
              title="Hapus transaksi" aria-label="Hapus ${escapeHtml(tx.description)}">
        <!-- Trash icon -->
        <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor"
             stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0
               01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0
               00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
      </button>
    </div>
  `;

  return li;
}

/**
 * Apply current filter values, then re-render the transaction list.
 * Called whenever data changes or a filter control changes.
 */
function renderTransactions() {
  const searchTerm     = filterSearch.value.trim().toLowerCase();
  const categoryFilter = filterCategory.value;
  const typeFilter     = filterType.value;

  // Filter from newest to oldest
  const filtered = transactions
    .filter(tx => {
      const matchSearch   = tx.description.toLowerCase().includes(searchTerm);
      const matchCategory = !categoryFilter || tx.category === categoryFilter;
      const matchType     = !typeFilter     || tx.type     === typeFilter;
      return matchSearch && matchCategory && matchType;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id));

  // Clear existing list
  transactionList.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    filtered.forEach(tx => transactionList.appendChild(createTransactionElement(tx)));
  }

  // Update count badge
  transactionCount.textContent =
    `${filtered.length} transaksi${transactions.length !== filtered.length
      ? ` dari ${transactions.length}`
      : ''}`;
}

/* ============================================================
   FORM — VALIDATION & HELPERS
   ============================================================ */

/**
 * Validate the form fields. Shows inline error messages.
 * @returns {boolean} true if all fields pass
 */
function validateForm() {
  let valid = true;

  if (inputDescription.value.trim() === '') {
    errDescription.classList.remove('hidden');
    inputDescription.classList.add('border-expense', 'focus:ring-expense/40');
    valid = false;
  } else {
    errDescription.classList.add('hidden');
    inputDescription.classList.remove('border-expense', 'focus:ring-expense/40');
  }

  const amt = parseFloat(inputAmount.value);
  if (!amt || amt <= 0) {
    errAmount.classList.remove('hidden');
    inputAmount.classList.add('border-expense', 'focus:ring-expense/40');
    valid = false;
  } else {
    errAmount.classList.add('hidden');
    inputAmount.classList.remove('border-expense', 'focus:ring-expense/40');
  }

  return valid;
}

/**
 * Read the currently-selected radio value for transaction type.
 * @returns {'income'|'expense'}
 */
function getSelectedType() {
  return document.querySelector('input[name="type"]:checked').value;
}

/**
 * Reset the form to its default "create" state.
 */
function resetForm() {
  form.reset();
  inputDate.value   = todayISO();
  editIdField.value = '';
  editingId         = null;

  formTitle.textContent    = 'Tambah Transaksi';
  btnSubmit.textContent    = 'Simpan Transaksi';
  btnCancel.classList.add('hidden');

  errDescription.classList.add('hidden');
  errAmount.classList.add('hidden');
  inputDescription.classList.remove('border-expense', 'focus:ring-expense/40');
  inputAmount.classList.remove('border-expense', 'focus:ring-expense/40');
}

/* ============================================================
   CRUD OPERATIONS
   ============================================================ */

/**
 * CREATE — add a new transaction to the array.
 * @param {Object} data
 */
function createTransaction(data) {
  transactions.push({ id: generateId(), ...data });
}

/**
 * UPDATE — replace an existing transaction in the array.
 * @param {string} id
 * @param {Object} data
 */
function updateTransaction(id, data) {
  transactions = transactions.map(tx => tx.id === id ? { id, ...data } : tx);
}

/**
 * DELETE — remove a transaction from the array by ID.
 * @param {string} id
 */
function deleteTransaction(id) {
  transactions = transactions.filter(tx => tx.id !== id);
}

/* ============================================================
   EVENT HANDLERS
   ============================================================ */

/** Handle form submission (create or update) */
form.addEventListener('submit', (e) => {
  e.preventDefault();

  if (!validateForm()) return;

  const data = {
    description: inputDescription.value.trim(),
    amount:      parseFloat(inputAmount.value),
    category:    inputCategory.value,
    type:        getSelectedType(),
    date:        inputDate.value || todayISO(),
  };

  if (editingId) {
    updateTransaction(editingId, data);
  } else {
    createTransaction(data);
  }

  saveToStorage();
  updateSummary();
  renderTransactions();
  resetForm();
});

/** Handle cancel button — exit edit mode */
btnCancel.addEventListener('click', () => {
  resetForm();
});

/**
 * Handle clicks on the transaction list (event delegation).
 * Targets: [data-action="edit"] and [data-action="delete"] buttons.
 */
transactionList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const id     = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'edit') {
    startEdit(id);
  } else if (action === 'delete') {
    openDeleteModal(id);
  }
});

/**
 * Populate the form with the data of a transaction for editing.
 * @param {string} id
 */
function startEdit(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;

  editingId              = id;
  editIdField.value      = id;
  inputDescription.value = tx.description;
  inputAmount.value      = tx.amount;
  inputCategory.value    = tx.category;
  inputDate.value        = tx.date;

  // Select the correct radio button
  document.querySelector(`input[name="type"][value="${tx.type}"]`).checked = true;

  formTitle.textContent  = 'Edit Transaksi';
  btnSubmit.textContent  = 'Perbarui Transaksi';
  btnCancel.classList.remove('hidden');

  // Scroll form into view
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   DELETE MODAL
   ============================================================ */

/**
 * Open the confirmation modal and stage the id for deletion.
 * @param {string} id
 */
function openDeleteModal(id) {
  deletingId = id;
  modalOverlay.classList.remove('hidden');
  modalConfirm.focus();
}

/** Close the modal without deleting */
function closeDeleteModal() {
  deletingId = null;
  modalOverlay.classList.add('hidden');
}

modalCancel.addEventListener('click', closeDeleteModal);

/** Close modal when clicking the backdrop */
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeDeleteModal();
});

/** Close modal on Escape key */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) {
    closeDeleteModal();
  }
});

/** Confirm deletion */
modalConfirm.addEventListener('click', () => {
  if (!deletingId) return;
  deleteTransaction(deletingId);
  saveToStorage();
  updateSummary();
  renderTransactions();
  closeDeleteModal();

  // If we were editing the same item, reset the form
  if (editingId === deletingId) resetForm();
});

/* ============================================================
   FILTER HANDLERS
   ============================================================ */

filterSearch.addEventListener('input',   renderTransactions);
filterCategory.addEventListener('change', renderTransactions);
filterType.addEventListener('change',     renderTransactions);

/* ============================================================
   SECURITY HELPER
   ============================================================ */

/**
 * Escape HTML special characters to prevent XSS when
 * inserting user-supplied text via innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   INITIALISATION
   ============================================================ */

/**
 * Bootstrap the app:
 *  1. Load persisted data from LocalStorage
 *  2. Set today's date as the default in the form
 *  3. Compute and display summary totals
 *  4. Render the transaction list
 */
function init() {
  transactions = loadFromStorage();
  inputDate.value = todayISO();
  updateSummary();
  renderTransactions();
}

init();
