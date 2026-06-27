// ===================================================================
// APP DE CONTROLE DE ESTOQUE
// Usa Supabase (Postgres gratuito na nuvem) como banco de dados.
// As credenciais ficam salvas no localStorage do navegador (não no código),
// então é seguro publicar este repositório no GitHub.
// ===================================================================

const CONFIG_KEY = 'estoque_supabase_config';
const LOW_STOCK_LIMIT = 10; // alerta "COMPRAR" quando o saldo for menor que isso
let supabase = null;
let state = {
  products: [],
  movements: [],
  currentMoveType: 'entrada',
};

// ---------- BOOT ----------
window.addEventListener('DOMContentLoaded', () => {
  const saved = getSavedConfig();
  if (saved) {
    initSupabase(saved.url, saved.key);
  } else {
    showSetupScreen();
  }
  bindStaticEvents();
  updateMoveNoteLabel();
});

function getSavedConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveConfig(url, key) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key }));
}

function showSetupScreen() {
  document.getElementById('screen-setup').hidden = false;
  document.getElementById('app').hidden = true;
}

async function initSupabase(url, key) {
  try {
    supabase = window.supabase.createClient(url, key);
    // testa a conexão com uma query simples
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = tabela vazia, tudo bem. Outros erros = problema real.
      if (error.message && error.message.includes('relation') ) {
        throw new Error('Tabelas não encontradas. Confira se você rodou o script SQL do README no seu projeto Supabase.');
      }
      throw error;
    }
    document.getElementById('screen-setup').hidden = true;
    document.getElementById('app').hidden = false;
    await loadAll();
  } catch (err) {
    showSetupScreen();
    const errBox = document.getElementById('setup-error');
    errBox.textContent = 'Não foi possível conectar: ' + (err.message || 'verifique a URL e a chave.');
    errBox.hidden = false;
  }
}

// ---------- EVENTOS ESTÁTICOS ----------
function bindStaticEvents() {
  document.getElementById('btn-save-config').addEventListener('click', () => {
    const url = document.getElementById('input-url').value.trim();
    const key = document.getElementById('input-key').value.trim();
    if (!url || !key) {
      const errBox = document.getElementById('setup-error');
      errBox.textContent = 'Preencha a URL e a chave.';
      errBox.hidden = false;
      return;
    }
    saveConfig(url, key);
    initSupabase(url, key);
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    if (confirm('Desconectar deste banco de dados e voltar para a tela de configuração?')) {
      localStorage.removeItem(CONFIG_KEY);
      location.reload();
    }
  });

  // Navegação por abas
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
  });

  // Modal de produto
  document.getElementById('btn-new-product').addEventListener('click', () => openProductModal());
  document.getElementById('btn-cancel-product').addEventListener('click', closeProductModal);
  document.getElementById('form-product').addEventListener('submit', handleSaveProduct);
  document.getElementById('btn-delete-product').addEventListener('click', handleDeleteProduct);

  // Toggle tipo de movimentação
  document.querySelectorAll('.move-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.move-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentMoveType = btn.dataset.type;
      updateMoveNoteLabel();
    });
  });

  document.getElementById('form-movement').addEventListener('submit', handleSaveMovement);
}

function switchScreen(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  document.querySelectorAll('.view').forEach(v => v.hidden = true);
  document.getElementById('screen-' + name).hidden = false;
  if (name === 'movements') populateProductSelect();
}

function updateMoveNoteLabel() {
  const label = document.getElementById('move-note-label');
  const input = document.getElementById('move-note');
  if (state.currentMoveType === 'saida') {
    label.textContent = 'Pra onde foi (opcional)';
    input.placeholder = 'Ex: instalação cliente João, rua X';
  } else {
    label.textContent = 'Situação (opcional)';
    input.placeholder = 'Ex: compra fornecedor X';
  }
}

// ---------- CARREGAR DADOS ----------
async function loadAll() {
  await Promise.all([loadProducts(), loadMovements()]);
  renderDashboard();
  renderProductsTable();
  renderHistory();
  populateProductSelect();
}

async function loadProducts() {
  const { data, error } = await supabase.from('products').select('*').order('name', { ascending: true });
  if (error) { showToast('Erro ao carregar produtos'); return; }
  state.products = data || [];
}

async function loadMovements() {
  const { data, error } = await supabase
    .from('movements')
    .select('*, products(name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) { showToast('Erro ao carregar histórico'); return; }
  state.movements = data || [];
}

// ---------- DASHBOARD ----------
function renderDashboard() {
  const totalProducts = state.products.length;
  const totalStock = state.products.reduce((sum, p) => sum + p.stock, 0);
  const totalIn = state.movements.filter(m => m.type === 'entrada').reduce((s, m) => s + m.quantity, 0);
  const totalOut = state.movements.filter(m => m.type === 'saida').reduce((s, m) => s + m.quantity, 0);

  document.getElementById('metric-products').textContent = totalProducts;
  document.getElementById('metric-stock').textContent = totalStock;
  document.getElementById('metric-in').textContent = totalIn;
  document.getElementById('metric-out').textContent = totalOut;

  const list = document.getElementById('product-list');
  if (state.products.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <span class="empty-icon">📭</span>
      <p>Nenhum produto cadastrado.</p>
      <p class="empty-sub">Toque em "Produtos" para adicionar.</p>
    </div>`;
    return;
  }
  list.innerHTML = state.products.map(p => {
    const low = p.stock < LOW_STOCK_LIMIT;
    return `<div class="product-row ${low ? 'low-stock' : ''}">
      <div class="product-info">
        <span class="product-name">${escapeHtml(p.name)}</span>
        ${p.sku ? `<span class="product-sku">${escapeHtml(p.sku)}</span>` : ''}
      </div>
      <span class="product-qty ${low ? 'low' : ''}">${p.stock}${low ? ' · COMPRAR' : ''}</span>
    </div>`;
  }).join('');
}

// ---------- PRODUTOS ----------
function renderProductsTable() {
  const container = document.getElementById('products-table');
  if (state.products.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <span class="empty-icon">📦</span>
      <p>Nenhum produto ainda.</p>
      <p class="empty-sub">Toque em "+ Novo" para cadastrar o primeiro.</p>
    </div>`;
    return;
  }
  container.innerHTML = state.products.map(p => {
    const low = p.stock < LOW_STOCK_LIMIT;
    return `
    <div class="product-edit-row" data-id="${p.id}">
      <div class="product-info">
        <span class="product-name">${escapeHtml(p.name)}</span>
        <span class="product-sku">${p.sku ? escapeHtml(p.sku) + ' · ' : ''}estoque: ${p.stock}${low ? ' · COMPRAR' : ''}</span>
      </div>
      <span class="product-qty">›</span>
    </div>
  `;
  }).join('');
  container.querySelectorAll('.product-edit-row').forEach(row => {
    row.addEventListener('click', () => {
      const product = state.products.find(p => p.id === row.dataset.id);
      openProductModal(product);
    });
  });
}

function openProductModal(product = null) {
  const modal = document.getElementById('modal-product');
  document.getElementById('product-error').hidden = true;
  document.getElementById('form-product').reset();
  if (product) {
    document.getElementById('modal-product-title').textContent = 'Editar produto';
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-sku').value = product.sku || '';
    document.getElementById('product-stock').value = product.stock;
    document.getElementById('btn-delete-product').hidden = false;
  } else {
    document.getElementById('modal-product-title').textContent = 'Novo produto';
    document.getElementById('product-id').value = '';
    document.getElementById('btn-delete-product').hidden = true;
  }
  modal.hidden = false;
}

function closeProductModal() {
  document.getElementById('modal-product').hidden = true;
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('product-id').value;
  const name = document.getElementById('product-name').value.trim();
  const sku = document.getElementById('product-sku').value.trim();
  const stock = parseInt(document.getElementById('product-stock').value, 10) || 0;

  const errBox = document.getElementById('product-error');
  errBox.hidden = true;

  if (!name) {
    errBox.textContent = 'Informe o nome do produto.';
    errBox.hidden = false;
    return;
  }

  const payload = { name, sku: sku || null, stock };
  let error;
  if (id) {
    ({ error } = await supabase.from('products').update(payload).eq('id', id));
  } else {
    ({ error } = await supabase.from('products').insert(payload));
  }

  if (error) {
    errBox.textContent = 'Erro ao salvar: ' + error.message;
    errBox.hidden = false;
    return;
  }

  closeProductModal();
  showToast(id ? 'Produto atualizado' : 'Produto cadastrado');
  await loadProducts();
  renderDashboard();
  renderProductsTable();
  populateProductSelect();
}

async function handleDeleteProduct() {
  const id = document.getElementById('product-id').value;
  if (!id) return;
  if (!confirm('Excluir este produto? O histórico de movimentações dele também será removido.')) return;

  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) {
    showToast('Erro ao excluir: ' + error.message);
    return;
  }
  closeProductModal();
  showToast('Produto excluído');
  await loadAll();
}

// ---------- MOVIMENTAÇÕES ----------
function populateProductSelect() {
  const select = document.getElementById('move-product');
  const current = select.value;
  select.innerHTML = state.products.map(p =>
    `<option value="${p.id}">${escapeHtml(p.name)} (estoque: ${p.stock})</option>`
  ).join('');
  if (state.products.length === 0) {
    select.innerHTML = `<option value="">Cadastre um produto primeiro</option>`;
  } else if (current) {
    select.value = current;
  }
}

async function handleSaveMovement(e) {
  e.preventDefault();
  const productId = document.getElementById('move-product').value;
  const qty = parseInt(document.getElementById('move-qty').value, 10);
  const note = document.getElementById('move-note').value.trim();
  const type = state.currentMoveType;
  const errBox = document.getElementById('move-error');
  errBox.hidden = true;

  if (!productId) {
    errBox.textContent = 'Cadastre um produto antes de registrar movimentações.';
    errBox.hidden = false;
    return;
  }
  if (!qty || qty <= 0) {
    errBox.textContent = 'Informe uma quantidade válida.';
    errBox.hidden = false;
    return;
  }

  const product = state.products.find(p => p.id === productId);
  if (type === 'saida' && qty > product.stock) {
    errBox.textContent = `Estoque insuficiente. Disponível: ${product.stock}.`;
    errBox.hidden = false;
    return;
  }

  // 1. registra a movimentação
  const { error: moveError } = await supabase.from('movements').insert({
    product_id: productId,
    type,
    quantity: qty,
    note: note || null,
  });
  if (moveError) {
    errBox.textContent = 'Erro ao registrar: ' + moveError.message;
    errBox.hidden = false;
    return;
  }

  // 2. atualiza o estoque do produto
  const newStock = type === 'entrada' ? product.stock + qty : product.stock - qty;
  const { error: stockError } = await supabase.from('products').update({ stock: newStock }).eq('id', productId);
  if (stockError) {
    errBox.textContent = 'Movimentação salva, mas falhou ao atualizar estoque: ' + stockError.message;
    errBox.hidden = false;
    return;
  }

  showToast(type === 'entrada' ? 'Entrada registrada' : 'Saída registrada');
  document.getElementById('form-movement').reset();
  document.getElementById('move-qty').value = '';
  await loadAll();
}

// ---------- HISTÓRICO ----------
function renderHistory() {
  const container = document.getElementById('history-list');
  if (state.movements.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <span class="empty-icon">📋</span>
      <p>Nenhuma movimentação ainda.</p>
    </div>`;
    return;
  }
  container.innerHTML = state.movements.map(m => {
    const isIn = m.type === 'entrada';
    const date = new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const productName = m.products ? m.products.name : 'Produto removido';
    return `<div class="history-row ${isIn ? 'in' : 'out'}">
      <div class="history-info">
        <span class="history-product">${escapeHtml(productName)}</span>
        <span class="history-meta">${date}${m.note ? ' · ' + escapeHtml(m.note) : ''}</span>
      </div>
      <span class="history-qty">${isIn ? '+' : '−'}${m.quantity}</span>
    </div>`;
  }).join('');
}

// ---------- UTIL ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let toastTimeout;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 2600);
}
