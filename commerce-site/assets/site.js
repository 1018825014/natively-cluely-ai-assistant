async function loadSiteConfig() {
  const response = await fetch('/site-config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('加载站点配置失败');
  }
  return response.json();
}

async function loadLatestRelease() {
  const response = await fetch('/downloads/latest.json', { cache: 'no-store' });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function applyText(config, latest) {
  document.querySelectorAll('[data-app-name]').forEach((node) => {
    node.textContent = config.appName;
  });
  document.querySelectorAll('[data-site-name]').forEach((node) => {
    node.textContent = config.siteName;
  });
  document.querySelectorAll('[data-tagline]').forEach((node) => {
    node.textContent = config.tagline;
  });
  document.querySelectorAll('[data-support-email]').forEach((node) => {
    node.textContent = config.supportEmail;
  });
  document.querySelectorAll('[data-current-version]').forEach((node) => {
    node.textContent = latest?.version || '待发布';
  });
}

function applyLinks(config) {
  const hrefMap = {
    website: config.websiteUrl,
    downloads: config.downloadUrl,
    windowsDownload: config.downloadWindowsUrl || config.downloadUrl,
    macDownload: config.downloadMacUrl || config.downloadUrl,
    purchase: config.purchasePageUrl,
    afdian: config.purchaseUrl,
    activationHelp: config.activationHelpUrl,
    support: config.supportUrl,
    privacy: config.privacyUrl,
    refund: config.refundUrl,
    eula: config.eulaUrl,
  };

  document.querySelectorAll('[data-link]').forEach((node) => {
    const key = node.getAttribute('data-link');
    if (key && hrefMap[key]) {
      node.setAttribute('href', hrefMap[key]);
    }
  });
}

function applySkuCards(config) {
  const container = document.querySelector('[data-sku-container]');
  if (!container || !config.skuCatalog) return;

  const skuCopy = [
    ['cn_1d', '快速体验完整激活、托管会话和下载交付链路，适合先确认兼容性。'],
    ['cn_7d', '适合短期冲刺、面试周或高密度会议周期。'],
    ['cn_30d', '适合作为中国区首发的标准月度方案。'],
    ['cn_365d', '适合长期工作流，减少频繁续购。'],
    ['cn_lifetime', '适合买断授权场景，但托管服务边界需按你的正式规则说明。'],
  ];

  container.innerHTML = skuCopy.map(([code, desc]) => {
    const sku = config.skuCatalog[code];
    if (!sku) return '';
    return `
      <article class="sku-card">
        <h3>${sku.label}</h3>
        <p>${desc}</p>
        <ul>
          <li>SKU 代号：<span class="mono">${code}</span></li>
          <li>默认 1 台设备激活</li>
          <li>到期后手动续购，不做自动扣费</li>
        </ul>
      </article>
    `;
  }).join('');
}

async function bootstrapSite() {
  try {
    const [config, latest] = await Promise.all([loadSiteConfig(), loadLatestRelease()]);
    applyText(config, latest);
    applyLinks(config);
    applySkuCards(config);
  } catch (error) {
    console.error(error);
  }
}

bootstrapSite();
