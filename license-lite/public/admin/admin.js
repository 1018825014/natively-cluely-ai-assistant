(function () {
  const state = {
    detail: null,
    licenses: [],
    query: "",
  };

  const elements = {
    clearSearchButton: document.getElementById("clearSearchButton"),
    createForm: document.getElementById("createForm"),
    createPromoDuration: document.getElementById("createPromoDuration"),
    createPromoDurationField: document.getElementById("createPromoDurationField"),
    createSku: document.getElementById("createSku"),
    dashboardPanel: document.getElementById("dashboardPanel"),
    detailCard: document.getElementById("detailCard"),
    detailForm: document.getElementById("detailForm"),
    detailLicenseKey: document.getElementById("detailLicenseKey"),
    expireForm: document.getElementById("expireForm"),
    expireLicenseKey: document.getElementById("expireLicenseKey"),
    licenseList: document.getElementById("licenseList"),
    listLimit: document.getElementById("listLimit"),
    loginForm: document.getElementById("loginForm"),
    loginHint: document.getElementById("loginHint"),
    loginPanel: document.getElementById("loginPanel"),
    loginPassword: document.getElementById("loginPassword"),
    loginUsername: document.getElementById("loginUsername"),
    logoutButton: document.getElementById("logoutButton"),
    refreshListButton: document.getElementById("refreshListButton"),
    reloadButton: document.getElementById("reloadButton"),
    renewForm: document.getElementById("renewForm"),
    renewLicenseKey: document.getElementById("renewLicenseKey"),
    renewPromoDuration: document.getElementById("renewPromoDuration"),
    renewPromoDurationField: document.getElementById("renewPromoDurationField"),
    renewSku: document.getElementById("renewSku"),
    resetForm: document.getElementById("resetForm"),
    resetLicenseKey: document.getElementById("resetLicenseKey"),
    resultBox: document.getElementById("resultBox"),
    revokeForm: document.getElementById("revokeForm"),
    revokeLicenseKey: document.getElementById("revokeLicenseKey"),
    searchQuery: document.getElementById("searchQuery"),
    sessionStatus: document.getElementById("sessionStatus"),
    toast: document.getElementById("toast"),
  };

  let toastTimer = null;

  bindEvents();
  bootstrap().catch((error) => {
    notify(error.message || "后台初始化失败。");
  });

  async function bootstrap() {
    await syncSession();
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", onLoginSubmit);
    elements.logoutButton.addEventListener("click", onLogout);
    elements.refreshListButton.addEventListener("click", () => loadLicenses());
    elements.reloadButton.addEventListener("click", () => loadLicenses());
    elements.clearSearchButton.addEventListener("click", onClearSearch);
    elements.searchQuery.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      loadLicenses();
    });

    elements.detailForm.addEventListener("submit", onDetailSubmit);
    elements.createForm.addEventListener("submit", onCreateSubmit);
    elements.renewForm.addEventListener("submit", onRenewSubmit);
    elements.resetForm.addEventListener("submit", onResetSubmit);
    elements.revokeForm.addEventListener("submit", onRevokeSubmit);
    elements.expireForm.addEventListener("submit", onExpireSubmit);
    elements.createSku.addEventListener("change", () => togglePromoField(elements.createSku, elements.createPromoDurationField));
    elements.renewSku.addEventListener("change", () => togglePromoField(elements.renewSku, elements.renewPromoDurationField));
    elements.licenseList.addEventListener("click", onLicenseListClick);
  }

  async function syncSession() {
    const payload = await api("/admin/api/session", { allowUnauthenticated: true });
    if (!payload.configured) {
      showLogin("后台密码还没有配置。部署时先设置 ADMIN_PASSWORD，配置完成后这里就能直接登录。");
      return;
    }

    if (!payload.authenticated) {
      showLogin("请输入后台账号和密码。");
      return;
    }

    showDashboard(payload.username || "admin");
    togglePromoField(elements.createSku, elements.createPromoDurationField);
    togglePromoField(elements.renewSku, elements.renewPromoDurationField);
    await loadLicenses();
  }

  async function onLoginSubmit(event) {
    event.preventDefault();
    const username = elements.loginUsername.value.trim();
    const password = elements.loginPassword.value;

    if (!username || !password) {
      notify("请输入账号和密码。");
      return;
    }

    const payload = await api("/admin/api/login", {
      method: "POST",
      body: { username, password },
    });

    elements.loginPassword.value = "";
    showDashboard(payload.username || username);
    await loadLicenses();
    notify("登录成功。");
  }

  async function onLogout() {
    await api("/admin/api/logout", {
      method: "POST",
      allowUnauthenticated: true,
    });
    showLogin("你已退出登录。");
    notify("已退出后台。");
  }

  async function onCreateSubmit(event) {
    event.preventDefault();
    const sku = elements.createSku.value;
    const payload = {
      activationLimit: optionalNumber("#createActivationLimit"),
      buyerId: valueOf("#createBuyerId"),
      durationDays: sku === "cn_1d_promo" ? promoDays(elements.createPromoDuration.value) : undefined,
      licenseKey: optionalValue("#createLicenseKey"),
      orderId: optionalValue("#createOrderId"),
      orderNote: optionalValue("#createOrderNote"),
      sku,
      wechatNote: optionalValue("#createWechatNote"),
    };

    const result = await api("/admin/api/licenses", {
      method: "POST",
      body: payload,
    });

    renderResult({
      title: "授权码创建成功",
      licenseKey: result.licenseKey,
      detail: result.detail,
      raw: result,
    });
    fillLicenseIntoForms(result.licenseKey);
    await loadLicenses();
    await loadLicenseDetail(result.licenseKey);
    notify("授权码已生成。");
    elements.createForm.reset();
    elements.createSku.value = "cn_1d";
    elements.createPromoDuration.value = "3";
    togglePromoField(elements.createSku, elements.createPromoDurationField);
  }

  async function onDetailSubmit(event) {
    event.preventDefault();
    await loadLicenseDetail(elements.detailLicenseKey.value.trim().toUpperCase());
  }

  async function onRenewSubmit(event) {
    event.preventDefault();
    const licenseKey = elements.renewLicenseKey.value.trim().toUpperCase();
    const sku = elements.renewSku.value;
    const result = await api(`/admin/api/licenses/${encodeURIComponent(licenseKey)}/renew`, {
      method: "POST",
      body: {
        durationDays: sku === "cn_1d_promo" ? promoDays(elements.renewPromoDuration.value) : undefined,
        sku,
      },
    });

    renderResult({
      title: "续费成功",
      licenseKey,
      detail: result,
      raw: result,
    });
    await loadLicenses();
    await loadLicenseDetail(licenseKey);
    notify("授权码已续费。");
  }

  async function onResetSubmit(event) {
    event.preventDefault();
    const licenseKey = elements.resetLicenseKey.value.trim().toUpperCase();
    const hardwareId = optionalValue("#resetHardwareId");
    const result = await api(`/admin/api/licenses/${encodeURIComponent(licenseKey)}/reset`, {
      method: "POST",
      body: { hardwareId },
    });

    renderResult({
      title: "激活已重置",
      licenseKey,
      detail: result.detail,
      raw: result,
    });
    await loadLicenses();
    await loadLicenseDetail(licenseKey);
    notify("已完成激活重置。");
  }

  async function onRevokeSubmit(event) {
    event.preventDefault();
    const licenseKey = elements.revokeLicenseKey.value.trim().toUpperCase();
    const reason = optionalValue("#revokeReason");
    const result = await api(`/admin/api/licenses/${encodeURIComponent(licenseKey)}/revoke`, {
      method: "POST",
      body: { reason },
    });

    renderResult({
      title: "授权已停用",
      licenseKey,
      detail: result,
      raw: result,
    });
    await loadLicenses();
    await loadLicenseDetail(licenseKey);
    notify("授权码已停用。");
  }

  async function onExpireSubmit(event) {
    event.preventDefault();
    const licenseKey = elements.expireLicenseKey.value.trim().toUpperCase();
    const reason = optionalValue("#expireReason");
    const result = await api(`/admin/api/licenses/${encodeURIComponent(licenseKey)}/expire`, {
      method: "POST",
      body: { reason },
    });

    renderResult({
      title: "授权已设为过期",
      licenseKey,
      detail: result,
      raw: result,
    });
    await loadLicenses();
    await loadLicenseDetail(licenseKey);
    notify("授权码已设为过期。");
  }

  async function loadLicenses() {
    const limit = Number(elements.listLimit.value || 20);
    const query = elements.searchQuery.value.trim();
    const params = new URLSearchParams({
      limit: String(Math.max(1, Math.min(100, limit))),
    });

    if (query) {
      params.set("q", query);
    }

    const payload = await api(`/admin/api/licenses?${params.toString()}`);
    state.licenses = payload.licenses || [];
    state.query = payload.query || query;
    renderLicenseList();
  }

  function onClearSearch() {
    elements.searchQuery.value = "";
    loadLicenses();
  }

  async function loadLicenseDetail(licenseKey) {
    if (!licenseKey) {
      notify("请输入授权码。");
      return;
    }

    const payload = await api(`/admin/api/licenses/${encodeURIComponent(licenseKey)}`);
    state.detail = payload;
    elements.detailLicenseKey.value = licenseKey;
    renderDetail(payload);
  }

  function renderLicenseList() {
    if (!state.licenses.length) {
      const message = state.query
        ? `没有找到和“${escapeHtml(state.query)}”相关的授权记录。`
        : "还没有授权记录。";
      elements.licenseList.innerHTML = `<div class="empty-state">${message}</div>`;
      return;
    }

    elements.licenseList.innerHTML = state.licenses.map((license) => `
      <article class="license-card">
        <div class="license-card-head">
          <div>
            <div class="license-key">${escapeHtml(license.licenseKey)}</div>
            <div class="muted">${formatSkuLabel(license.sku, license.durationDays)} | 创建时间 ${formatDateTime(license.createdAt)}</div>
          </div>
          <div class="status-pill ${statusClass(license.status)}">${escapeHtml(statusText(license.status))}</div>
        </div>
        <div class="meta-grid">
          <div class="meta-row"><span>买家</span><span>${escapeHtml(license.buyerId || "-")}</span></div>
          <div class="meta-row"><span>微信备注</span><span>${escapeHtml(license.wechatNote || "-")}</span></div>
          <div class="meta-row"><span>到期</span><span>${license.expiresAt ? escapeHtml(formatDateTime(license.expiresAt)) : "未开始 / 永久"}</span></div>
          <div class="meta-row"><span>设备上限</span><span>${license.activationLimit === 0 ? "不限" : escapeHtml(String(license.activationLimit))}</span></div>
          <div class="meta-row"><span>当前激活设备</span><span>${escapeHtml(String(license.activeActivations || 0))}</span></div>
        </div>
        <div class="license-actions">
          <button class="tiny-button" data-action="copy" data-key="${escapeHtmlAttr(license.licenseKey)}">复制授权码</button>
          <button class="tiny-button" data-action="detail" data-key="${escapeHtmlAttr(license.licenseKey)}">查看详情</button>
          <button class="tiny-button" data-action="renew" data-key="${escapeHtmlAttr(license.licenseKey)}">填入续费</button>
          <button class="tiny-button" data-action="reset" data-key="${escapeHtmlAttr(license.licenseKey)}">填入重置</button>
          <button class="tiny-button" data-action="revoke" data-key="${escapeHtmlAttr(license.licenseKey)}">填入停用</button>
          <button class="tiny-button" data-action="expire" data-key="${escapeHtmlAttr(license.licenseKey)}">填入过期</button>
        </div>
      </article>
    `).join("");
  }

  function renderDetail(payload) {
    if (!payload || !payload.license) {
      elements.detailCard.innerHTML = '<div class="empty-state">没有找到授权详情。</div>';
      return;
    }

    const activations = (payload.activations || []).map((item) => `
      <div class="detail-section">
        <div class="detail-section-head">
          <strong>${escapeHtml(item.hardwareId)}</strong>
          <span class="muted">${item.releasedAt ? "已释放" : "激活中"}</span>
        </div>
        <div class="meta-grid">
          <div class="meta-row"><span>首次激活</span><span>${escapeHtml(formatDateTime(item.firstActivatedAt))}</span></div>
          <div class="meta-row"><span>最近验证</span><span>${escapeHtml(formatDateTime(item.lastValidatedAt))}</span></div>
          <div class="meta-row"><span>释放时间</span><span>${item.releasedAt ? escapeHtml(formatDateTime(item.releasedAt)) : "-"}</span></div>
        </div>
      </div>
    `).join("");

    const events = (payload.events || []).map((event) => `
      <div class="detail-section">
        <div class="detail-section-head">
          <strong>${escapeHtml(event.eventType)}</strong>
          <span class="muted">${escapeHtml(formatDateTime(event.createdAt))}</span>
        </div>
        <pre class="detail-pre">${escapeHtml(JSON.stringify(event.payload, null, 2))}</pre>
      </div>
    `).join("");

    elements.detailCard.innerHTML = `
      <div class="detail-section">
        <div class="detail-section-head">
          <div>
            <div class="license-key">${escapeHtml(payload.license.licenseKey)}</div>
            <div class="muted">${escapeHtml(formatSkuLabel(payload.license.sku, payload.license.durationDays))}</div>
          </div>
          <div class="status-pill ${statusClass(payload.license.status)}">${escapeHtml(statusText(payload.license.status))}</div>
        </div>
        <div class="meta-grid">
          <div class="meta-row"><span>买家</span><span>${escapeHtml(payload.license.buyerId || "-")}</span></div>
          <div class="meta-row"><span>订单号</span><span>${escapeHtml(payload.license.orderId || "-")}</span></div>
          <div class="meta-row"><span>微信备注</span><span>${escapeHtml(payload.license.wechatNote || "-")}</span></div>
          <div class="meta-row"><span>订单备注</span><span>${escapeHtml(payload.license.orderNote || "-")}</span></div>
          <div class="meta-row"><span>设备上限</span><span>${payload.license.activationLimit === 0 ? "不限" : escapeHtml(String(payload.license.activationLimit))}</span></div>
          <div class="meta-row"><span>首次激活</span><span>${payload.license.activatedAt ? escapeHtml(formatDateTime(payload.license.activatedAt)) : "未激活"}</span></div>
          <div class="meta-row"><span>到期时间</span><span>${payload.license.expiresAt ? escapeHtml(formatDateTime(payload.license.expiresAt)) : "未开始 / 永久"}</span></div>
          <div class="meta-row"><span>创建时间</span><span>${escapeHtml(formatDateTime(payload.license.createdAt))}</span></div>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-head">
          <strong>激活记录</strong>
          <span class="muted">${(payload.activations || []).length} 条</span>
        </div>
        ${activations || '<div class="empty-state">暂无激活记录。</div>'}
      </div>
      <div class="detail-section">
        <div class="detail-section-head">
          <strong>事件记录</strong>
          <span class="muted">${(payload.events || []).length} 条</span>
        </div>
        ${events || '<div class="empty-state">暂无事件记录。</div>'}
      </div>
    `;
  }

  function renderResult({ title, licenseKey, detail, raw }) {
    const license = detail?.license || raw?.license || null;
    const displayKey = licenseKey || license?.licenseKey || raw?.licenseKey || "-";
    const duration = license ? formatSkuLabel(license.sku, license.durationDays) : "-";

    elements.resultBox.innerHTML = `
      <div class="result-item">
        <div class="result-item-head">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <div class="muted">${escapeHtml(duration)}</div>
          </div>
          <div class="status-pill ${statusClass(license?.status || "valid")}">${escapeHtml(statusText(license?.status || "valid"))}</div>
        </div>
        <div class="meta-grid">
          <div class="meta-row"><span>授权码</span><span>${escapeHtml(displayKey)}</span></div>
          <div class="meta-row"><span>买家</span><span>${escapeHtml(license?.buyerId || raw?.license?.buyerId || "-")}</span></div>
          <div class="meta-row"><span>到期</span><span>${license?.expiresAt ? escapeHtml(formatDateTime(license.expiresAt)) : "未开始 / 永久"}</span></div>
        </div>
        <div class="result-actions">
          <button class="tiny-button" type="button" id="copyResultButton">复制授权码</button>
          <button class="tiny-button" type="button" id="viewResultDetailButton">查看详情</button>
        </div>
      </div>
    `;

    document.getElementById("copyResultButton").addEventListener("click", () => copyText(displayKey));
    document.getElementById("viewResultDetailButton").addEventListener("click", () => loadLicenseDetail(displayKey));
  }

  function fillLicenseIntoForms(licenseKey) {
    elements.detailLicenseKey.value = licenseKey;
    elements.expireLicenseKey.value = licenseKey;
    elements.renewLicenseKey.value = licenseKey;
    elements.resetLicenseKey.value = licenseKey;
    elements.revokeLicenseKey.value = licenseKey;
  }

  function onLicenseListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const licenseKey = button.dataset.key || "";
    if (!licenseKey) {
      return;
    }

    if (action === "copy") {
      copyText(licenseKey);
      return;
    }

    fillLicenseIntoForms(licenseKey);
    if (action === "detail") {
      loadLicenseDetail(licenseKey);
      return;
    }

    if (action === "renew") {
      notify("已填入续费表单。");
      return;
    }

    if (action === "reset") {
      notify("已填入重置表单。");
      return;
    }

    if (action === "revoke") {
      notify("已填入停用表单。");
      return;
    }

    if (action === "expire") {
      notify("已填入过期表单。");
    }
  }

  function togglePromoField(selectElement, fieldElement) {
    fieldElement.hidden = selectElement.value !== "cn_1d_promo";
  }

  function promoDays(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 7) {
      throw new Error("推广试用天数必须在 1 到 7 天之间。");
    }

    return Math.floor(parsed);
  }

  function valueOf(selector) {
    const element = document.querySelector(selector);
    return `${element.value || ""}`.trim();
  }

  function optionalValue(selector) {
    const value = valueOf(selector);
    return value || undefined;
  }

  function optionalNumber(selector) {
    const value = optionalValue(selector);
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function showLogin(message) {
    elements.loginPanel.hidden = false;
    elements.dashboardPanel.hidden = true;
    elements.loginHint.textContent = message;
  }

  function showDashboard(username) {
    elements.loginPanel.hidden = true;
    elements.dashboardPanel.hidden = false;
    elements.sessionStatus.textContent = `已登录为 ${username}`;
  }

  async function api(url, options) {
    const settings = options || {};
    const response = await fetch(url, {
      method: settings.method || "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: settings.body ? JSON.stringify(settings.body) : undefined,
      credentials: "same-origin",
    });

    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && !settings.allowUnauthenticated) {
      showLogin("登录已过期，请重新输入后台密码。");
      throw new Error(payload.error || "请先登录后台。");
    }

    if (!response.ok || payload.success === false) {
      if (settings.allowUnauthenticated) {
        return payload;
      }

      throw new Error(payload.error || "请求失败。");
    }

    return payload;
  }

  async function copyText(text) {
    if (!text || text === "-") {
      notify("没有可复制的授权码。");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        notify("授权码已复制。");
        return;
      }
    } catch (error) {
      console.warn("Clipboard API failed:", error);
    }

    window.prompt("请手动复制授权码", text);
  }

  function notify(message) {
    clearTimeout(toastTimer);
    elements.toast.hidden = false;
    elements.toast.textContent = message;
    toastTimer = setTimeout(() => {
      elements.toast.hidden = true;
    }, 2400);
  }

  function formatSkuLabel(sku, durationDays) {
    const labels = {
      cn_1d: "1 天正式版",
      cn_1d_promo: `推广试用码${durationDays ? `（${durationDays} 天）` : ""}`,
      cn_7d: "7 天正式版",
      cn_30d: "30 天正式版",
      cn_365d: "365 天正式版",
      cn_lifetime: "永久版",
    };
    return labels[sku] || sku || "-";
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    try {
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function statusText(status) {
    const labels = {
      activation_limit_hit: "设备已满",
      expired: "已过期",
      inactive: "未激活",
      invalid_license: "无效",
      network_error: "网络异常",
      offline_grace: "离线宽限",
      revoked: "已停用",
      valid: "有效",
    };
    return labels[status] || status || "-";
  }

  function statusClass(status) {
    return `status-${status || "inactive"}`;
  }

  function escapeHtml(value) {
    return `${value || ""}`
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeHtmlAttr(value) {
    return escapeHtml(value);
  }
})();
