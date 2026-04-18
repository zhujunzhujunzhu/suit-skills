import { expect, test, type Page } from '@playwright/test';

const SOURCES_RESPONSE = {
  defaultSource: 'default',
  sources: [
    {
      name: 'default',
      url: 'https://gitee.com/digital-construction-center_1/suit-skills-lib.git',
      enabled: true,
      builtin: true,
      label: 'Suit Skills default source',
      category: 'cn',
      description: 'Default skill source for tests.',
      effectiveUrl:
        'https://gitee.com/digital-construction-center_1/suit-skills-lib.git',
    },
  ],
};

function makeSkills(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = String(index + 1).padStart(4, '0');
    return {
      name: `skill-${id}`,
      version: `1.0.${index + 1}`,
      description: `Test skill ${id}`,
      author: 'e2e',
      tags: index % 2 === 0 ? ['frontend', 'quality'] : ['backend'],
      sourceName: 'default',
      installed: false,
      installedTargets: [],
      metadataSource: 'skill-md',
    };
  });
}

async function mockConsoleApi(page: Page, options: { skillCount?: number } = {}) {
  const skills = makeSkills(options.skillCount ?? 12);
  let sourcePostCount = 0;

  await page.addInitScript(() => {
    localStorage.setItem('suit-skills-locale', 'en');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    if (method === 'GET' && url.pathname === '/api/sources') {
      await route.fulfill({ json: SOURCES_RESPONSE });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/skills') {
      await route.fulfill({ json: { items: skills, warnings: [] } });
      return;
    }

    if (method === 'GET' && url.pathname.startsWith('/api/skills/')) {
      const name = decodeURIComponent(url.pathname.slice('/api/skills/'.length));
      const skill = skills.find((item) => item.name === name) ?? skills[0]!;
      await route.fulfill({
        json: {
          ...skill,
          skillDir: `D:/tmp/${skill.name}`,
          markdown: `# ${skill.name}\n\n${skill.description}`,
          frontmatter: { name: skill.name },
        },
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/installed') {
      await route.fulfill({ json: { items: [] } });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/sources') {
      sourcePostCount += 1;
      await route.fulfill({
        status: 400,
        json: {
          error: {
            code: 'INVALID_SOURCE_NAME',
            message: 'Source name is required',
          },
        },
      });
      return;
    }

    await route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: 'Not found' } },
    });
  });

  return {
    getSourcePostCount: () => sourcePostCount,
  };
}

test.describe('web console regression smoke', () => {
  test('mobile navigation keeps accessible names and favicon resolves', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockConsoleApi(page);

    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Skills' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Installed' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sources' })).toBeVisible();

    const faviconHref = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(faviconHref).toBe('/favicon.svg');
    const faviconResponse = await page.request.get(
      new URL(faviconHref!, page.url()).toString(),
    );
    expect(faviconResponse.status()).toBe(200);
  });

  test('mobile skills list virtualizes large catalogs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockConsoleApi(page, { skillCount: 1400 });

    await page.goto('/');
    await expect(page.locator('.skill-card').first()).toContainText('skill-0001');

    const renderedCards = await page.locator('.skill-card').count();
    const renderedRows = await page.locator('.skill-virtual-row').count();

    expect(renderedCards).toBeGreaterThan(0);
    expect(renderedCards).toBeLessThan(50);
    expect(renderedRows).toBeLessThan(50);
  });

  test('empty source form validates client-side and sends no POST', async ({
    page,
  }) => {
    const api = await mockConsoleApi(page);

    await page.goto('/');
    await page.getByRole('button', { name: 'Sources' }).click();
    await page.getByRole('button', { name: 'Add source', exact: true }).click();

    await expect(page.getByText('Source name is required')).toBeVisible();
    expect(api.getSourcePostCount()).toBe(0);
  });
});
