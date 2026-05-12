import { expect, test, type Page } from '@playwright/test';

const apiBase = 'http://127.0.0.1:4591';

async function gotoMarket(page: Page) {
  await page.goto('/');
  await expect(page.locator('.page-header h1')).toHaveText('技能市场');
}

test.describe('platform skill marketplace end to end', () => {
  test('loads marketplace, filters skills, and opens detail page', async ({ page }) => {
    await gotoMarket(page);

    expect(await page.locator('.skill-row').count()).toBeGreaterThan(0);
    const search = page.locator('input').first();
    await expect(search).toBeVisible();

    await search.fill('frontend');
    const frontendRow = page.locator('.skill-row').filter({ hasText: 'frontend-design' });
    await expect(frontendRow).toBeVisible();

    await frontendRow.click();
    await expect(page.locator('.detail-title h1')).toHaveText('frontend-design');
  });

  test('uploads a skill package and shows it in my packages', async ({ page }) => {
    const skillName = `e2e-upload-${Date.now()}`;

    await gotoMarket(page);
    await page.getByRole('button', { name: /上传|涓婁紶/ }).click();

    await page.locator('input[placeholder*="frontend-design"]').fill(skillName);
    await page.locator('textarea').fill('E2E uploaded skill package.');
    await page.locator('input[placeholder*="1.0.0"]').fill('0.1.0');
    await page
      .locator('input[placeholder*="git@git.company.com"]')
      .fill('git@git.company.com:ai/clawhub-skills.git');
    await page.getByRole('button', { name: /提交|鎻愪氦/ }).click();

    await page.getByRole('button', { name: /我的|鎴戠殑/ }).click();
    await expect(page.getByText(skillName)).toBeVisible();
  });

  test('adds a git-backed source for publishing', async ({ page }) => {
    const gitUrl = `git@git.company.com:ai/clawhub-e2e-${Date.now()}.git`;

    await gotoMarket(page);
    await page.getByRole('button', { name: '源管理' }).click();
    await expect(page.getByRole('heading', { name: '源管理' })).toBeVisible();

    await page.getByLabel('源标识').fill(`e2e-${Date.now()}`);
    await page.getByLabel('显示名称').fill('E2E source');
    await page.getByLabel('Git 地址').fill(gitUrl);
    await page.getByLabel('分支').fill('main');
    await page.getByLabel('技能目录').fill('skills/');
    await page.getByRole('button', { name: '添加源' }).click();

    await expect(page.getByText(gitUrl)).toBeVisible();
    await expect(page.getByText('发布目标')).toBeVisible();
  });

  test('backend API supports skills, upload, sources, and evaluations', async ({ request }) => {
    const skills = await request.get(`${apiBase}/api/skills`);
    expect(skills.ok()).toBe(true);
    const skillsPayload = await skills.json();
    expect(skillsPayload.total).toBeGreaterThan(0);

    const name = `api-e2e-${Date.now()}`;
    const upload = await request.post(`${apiBase}/api/skills/upload`, {
      data: {
        name,
        description: 'API e2e uploaded skill',
        author: 'E2E',
        category: 'test',
        version: '0.1.0',
        tags: ['E2E'],
        owner: 'platform',
      },
    });
    expect(upload.ok()).toBe(true);
    const uploaded = await upload.json();
    expect(uploaded.name).toBe(name);

    const evaluation = await request.post(`${apiBase}/api/evaluations`, {
      data: {
        skillId: uploaded.id,
        skillName: uploaded.name,
        rating: 5,
        comment: 'API e2e evaluation',
        metadata: { tags: ['E2E'], anonymous: true },
      },
    });
    expect(evaluation.ok()).toBe(true);

    const source = await request.post(`${apiBase}/api/sources`, {
      data: {
        name: `api-e2e-source-${Date.now()}`,
        label: 'API E2E source',
        description: 'API E2E source',
        url: 'git@git.company.com:ai/api-e2e.git',
        branch: 'main',
        skillsDirectory: 'skills/',
        publishEnabled: true,
      },
    });
    expect(source.ok()).toBe(true);
  });
});
