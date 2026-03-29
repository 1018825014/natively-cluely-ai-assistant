async function queryLicenseStatus(orderId, buyerId) {
  const params = new URLSearchParams({
    order_id: orderId,
    buyer_id: buyerId,
  });
  const response = await fetch(`/licenses/status?${params.toString()}`, {
    cache: 'no-store',
  });
  return response.json();
}

function renderResult(node, payload) {
  if (!payload.success) {
    node.className = 'warning';
    node.textContent = payload.error || '未找到匹配的许可证，请核对订单号和买家 ID。';
    return;
  }

  const license = payload.license;
  node.className = 'result visible';
  node.textContent = [
    `许可证：${license.licenseKey}`,
    `SKU：${license.sku}`,
    `状态：${readableStatus(payload.status)}`,
    `到期时间：${formatDate(license.expiresAt)}`,
    `设备上限：${license.activationLimit}`,
    `订单号：${license.orderId}`,
    `买家 ID：${license.buyerId}`,
  ].join('\n');
}

function readableStatus(status) {
  switch (status) {
    case 'valid':
      return '有效';
    case 'expired':
      return '已过期';
    case 'revoked':
      return '已停用';
    case 'activation_limit_hit':
      return '设备上限已满';
    case 'offline_grace':
      return '离线宽限中';
    default:
      return status || '未知';
  }
}

function formatDate(value) {
  if (!value) return '永久有效';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('[data-license-help-form]');
  const result = document.querySelector('[data-license-result]');
  if (!form || !result) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const orderId = form.querySelector('[name="order_id"]').value.trim();
    const buyerId = form.querySelector('[name="buyer_id"]').value.trim();

    if (!orderId || !buyerId) {
      result.className = 'warning';
      result.textContent = '请同时填写爱发电订单号和买家 ID。';
      return;
    }

    result.className = 'note';
    result.textContent = '正在查询许可证，请稍候...';

    try {
      const payload = await queryLicenseStatus(orderId, buyerId);
      renderResult(result, payload);
    } catch (error) {
      console.error(error);
      result.className = 'warning';
      result.textContent = '查询失败，请稍后重试或联系支持邮箱。';
    }
  });
});
